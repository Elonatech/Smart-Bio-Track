import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { UserListItemKey } from '@smartbiotrack/types';
import { MailService } from '../mail/mail.service';
import { CreateUserDto } from './dto/create-users.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  ACTIVATION_RESEND_COOLDOWN_SECONDS,
  ACTIVATION_TOKEN_TTL_DAYS,
  expiryInDays,
  generateToken,
  hashToken,
} from '../common/token.util';
import { generateUniqueEmployeeId } from '../common/employee-id.util';
import { AuditService } from '../audit/audit.service';

/**
 * Which roles each role has authority over — for provisioning, suspending and
 * deleting alike.
 *
 * SUPER_ADMIN may create another SUPER_ADMIN so an organization is not left
 * without full control if its founding admin leaves. HR_ADMIN is capped at
 * TEAM_LEAD/EMPLOYEE so it cannot escalate itself or create a peer.
 *
 * The same ceiling has to apply to suspension and deletion, not just creation:
 * an HR_ADMIN who cannot make a SUPER_ADMIN but can suspend every existing one
 * has taken the organization over by the back door.
 */
const ROLE_AUTHORITY_MATRIX: Record<UserRole, UserRole[]> = {
  SUPER_ADMIN: ['SUPER_ADMIN', 'HR_ADMIN', 'TEAM_LEAD', 'EMPLOYEE'],
  HR_ADMIN: ['TEAM_LEAD', 'EMPLOYEE'],
  TEAM_LEAD: [],
  EMPLOYEE: [],
};

/** The authenticated caller, as JwtStrategy hands them to the controller. */
interface Caller {
  id: string;
  /** Recorded on audit entries as the actor's name at the time of the action. */
  name: string;
  role: UserRole;
  organizationId: string;
  /** Nullable by schema: a user need not belong to a department. */
  departmentId: string | null;
}

/**
 * Exactly the columns `GET /users` returns, tied to the shared definition.
 *
 * `satisfies Record<UserListItemKey, true>` is doing real work: it fails to
 * compile if this select is missing a key the shared `UserListItem` declares,
 * **and** if it adds one the shared type does not. Before #26 the two were kept
 * in step by memory, and were not — the browser's copy had eight fields while
 * this sent nine, so `createdAt` went over the wire and was ignored.
 *
 * Adding a column to the staff list now starts here *and* in packages/types, or
 * it does not compile. That is the point: the wire format is a contract with
 * another program, not a local detail.
 */
const USER_LIST_SELECT = {
  id: true,
  employeeId: true,
  name: true,
  email: true,
  role: true,
  status: true,
  departmentId: true,
  officeId: true,
  createdAt: true,
} satisfies Record<UserListItemKey, true>;

/**
 * A short, human description of what an update changed, for the audit label.
 *
 * The trail already records who acted and on whom. What it cannot reconstruct
 * afterwards is *what was altered* — the row holds the post-change state, so a
 * disputed promotion six months later has no record of what the role was
 * before. This puts the before-and-after in the entry itself.
 *
 * Only genuinely changed fields appear: a PATCH that resends the same name is
 * not a name change, and recording it as one would fill the trail with noise
 * that an auditor has to read past.
 */
function describeUserChanges(
  before: { name: string; role: UserRole; departmentId: string | null; officeId: string | null },
  dto: UpdateUserDto,
): string {
  const parts: string[] = [];

  if (dto.name !== undefined && dto.name !== before.name) {
    parts.push(`name "${before.name}" to "${dto.name}"`);
  }
  if (dto.role !== undefined && dto.role !== before.role) {
    parts.push(`role ${before.role} to ${dto.role}`);
  }
  if (dto.departmentId !== undefined && dto.departmentId !== before.departmentId) {
    parts.push(dto.departmentId ? 'department reassigned' : 'department cleared');
  }
  if (dto.officeId !== undefined && dto.officeId !== before.officeId) {
    parts.push(dto.officeId ? 'office reassigned' : 'office cleared');
  }

  // Reachable: a PATCH that resends every current value passes the
  // "no changes supplied" check, because keys were supplied, and changes
  // nothing. Better to say so than to leave the label trailing an em dash.
  return parts.length > 0 ? parts.join(', ') : 'no effective change';
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Takes the whole caller rather than a role and an organization id, matching
   * every other method here. The audit trail needs the actor's identity, not
   * just their permissions.
   */
  async provision(dto: CreateUserDto, caller: Caller, ipAddress?: string) {
    const { role: callerRole, organizationId } = caller;
    const allowedRoles = ROLE_AUTHORITY_MATRIX[callerRole] ?? [];

    if (!allowedRoles.includes(dto.role)) {
      throw new ForbiddenException(
        `A ${callerRole} may not create a user with the role ${dto.role}`,
      );
    }

    const normalizedEmail = dto.email.toLowerCase().trim();

    const existingByEmail = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingByEmail) {
      // How much this says depends on WHOSE user it is.
      //
      // Email is unique platform-wide, so an address already taken by another
      // organization cannot be used here either — but saying why would let an
      // admin at one customer test whether a given person has an account at
      // another. For an attendance product that is a staff directory probe, one
      // address at a time. Outside the caller's own organization the answer is
      // deliberately uninformative: no name, no role, no status, no hint that
      // another tenant exists.
      //
      // Inside their own organization there is nothing to protect and plenty to
      // explain, so those messages stay specific and useful.
      if (existingByEmail.organizationId !== organizationId) {
        throw new BadRequestException(
          'This email address is not available. Use a different one.',
        );
      }

      // A deleted user still holds their email — deliberately, so re-hiring
      // finds the person's history instead of colliding with a ghost record.
      // Saying so turns a dead end into an instruction; the generic message
      // left an admin retyping an address that would never be accepted.
      throw new BadRequestException(
        existingByEmail.status === UserStatus.DELETED
          ? 'An account with this email was deleted. Its records are kept for compliance, so the address cannot be reused.'
          : 'A user with this email already exists',
      );
    }

    // Only worth checking when the caller supplied one. A generated ID is
    // already guaranteed unused by generateUniqueEmployeeId, which does
    // its own lookup and retries on collision.
    if (dto.employeeId) {
      const existingByEmployeeId = await this.prisma.user.findUnique({
        where: { employeeId: dto.employeeId },
      });

      if (existingByEmployeeId) {
        // Same split as the email check above: an employee ID taken inside this
        // organization is the admin's own data and worth naming, while one taken
        // elsewhere is another tenant's and gets the uninformative answer.
        throw new BadRequestException(
          existingByEmployeeId.organizationId === organizationId
            ? 'A user with this employee ID already exists'
            : 'This employee ID is not available. Use a different one.',
        );
      }
    }

    const employeeId =
      dto.employeeId ?? (await generateUniqueEmployeeId(this.prisma, dto.role));

    // Both lookups are scoped to the caller's organization, so an admin
    // cannot attach a new user to another tenant's department or office.
    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, organizationId },
      });
      if (!department) {
        throw new BadRequestException('Invalid department ID');
      }
    }

    if (dto.officeId) {
      const office = await this.prisma.office.findFirst({
        where: { id: dto.officeId, organizationId },
      });
      if (!office) {
        throw new BadRequestException('Invalid office ID');
      }
    }

    const rawToken = generateToken();

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          employeeId,
          name: dto.name,
          email: normalizedEmail,
          role: dto.role,
          status: 'PENDING',
          organizationId,
          departmentId: dto.departmentId,
          officeId: dto.officeId,
        },
      });

      await tx.activationToken.create({
        data: {
          tokenHash: hashToken(rawToken),
          userId: created.id,
          expiresAt: expiryInDays(ACTIVATION_TOKEN_TTL_DAYS),
        },
      });

      await this.auditService.record(
        {
          organizationId,
          actor: caller,
          action: 'USER_PROVISIONED',
          targetType: 'User',
          targetId: created.id,
          targetLabel: `${created.name} (${created.employeeId})`,
          ipAddress,
        },
        tx,
      );

      return created;
    });

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    try {
      await this.mailService.sendActivationEmail(
        user.email,
        rawToken,
        organization?.name ?? 'Your organization',
      );
    } catch {
      // The user row and its token are already committed. Deleting them here
      // would be worse than leaving them: the admin would see an error and a
      // vanished user, and re-creating hits the duplicate-email guard anyway.
      // The account simply stays PENDING until the invite is re-sent.
      throw new InternalServerErrorException(
        `${user.name} was created, but the activation email could not be sent. Re-send the invitation from the user's profile.`,
      );
    }

    return {
      id: user.id,
      employeeId: user.employeeId,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      departmentId: user.departmentId,
      officeId: user.officeId,
    };
  }

  /**
   * Loads a user the caller is allowed to act on, or throws.
   *
   * Scoping the lookup to the caller's organization is what keeps one tenant's
   * admin out of another's records — without it a guessed UUID is enough to
   * suspend or delete a stranger. A user in another organization reads as
   * "not found" rather than "forbidden" on purpose: the distinction would
   * confirm that the ID exists.
   */
  private async findManageable(
    userId: string,
    caller: Caller,
    action: 'suspend' | 'delete' | 'edit' | 'resend the invitation for',
  ) {
    // Suspending yourself locks you out on the next request, since JwtStrategy
    // rejects any user who is not ACTIVE — and nobody is left who can undo it
    // if you were the only admin.
    if (userId === caller.id) {
      throw new BadRequestException(`You cannot ${action} your own account.`);
    }

    // A deleted user reads as "not found" for the same reason another tenant's
    // does: they are gone as far as this API is concerned, and deleting or
    // suspending someone twice is not a thing that should half-work.
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId: caller.organizationId,
        status: { not: 'DELETED' },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!(ROLE_AUTHORITY_MATRIX[caller.role] ?? []).includes(user.role)) {
      throw new ForbiddenException(
        `A ${caller.role} may not ${action} a user with the role ${user.role}`,
      );
    }

    return user;
  }

  /**
   * Issues a fresh invitation to someone still waiting to activate.
   *
   * The feature `provision` already tells admins to use: when the activation
   * email fails to send it says "Re-send the invitation from the user's
   * profile", which until now pointed at nothing. Before this, a lost or
   * expired invitation stranded the account in PENDING permanently — the only
   * way out was deleting and recreating the person, which is now impossible
   * anyway, since a soft-deleted user keeps their email address.
   */
  async resendInvitation(userId: string, caller: Caller, ipAddress?: string) {
    const user = await this.findManageable(
      userId,
      caller,
      'resend the invitation for',
    );

    // Only PENDING has an invitation to resend. An ACTIVE or SUSPENDED user set
    // a password long ago; sending them an activation link would be a working
    // route into the account for anyone who reads their inbox, which is what
    // password reset is for and is deliberately shorter-lived.
    if (user.status !== UserStatus.PENDING) {
      throw new BadRequestException(
        `${user.name} has already activated their account. Send a password reset instead.`,
      );
    }

    const mostRecent = await this.prisma.activationToken.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    const cooldownEndsAt = mostRecent
      ? new Date(
          mostRecent.createdAt.getTime() +
            ACTIVATION_RESEND_COOLDOWN_SECONDS * 1000,
        )
      : null;

    if (cooldownEndsAt && cooldownEndsAt > new Date()) {
      throw new BadRequestException(
        `An invitation was just sent to ${user.name}. Wait a moment before sending another.`,
      );
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: caller.organizationId },
    });

    const rawToken = generateToken();

    await this.prisma.$transaction(async (tx) => {
      // Retire every outstanding invitation before issuing the replacement, so
      // a link from an earlier email cannot still be redeemed. Stamping usedAt
      // reuses the single-use check completeRegistration already applies,
      // rather than inventing a second way for a token to be dead.
      await tx.activationToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      await tx.activationToken.create({
        data: {
          tokenHash: hashToken(rawToken),
          userId: user.id,
          expiresAt: expiryInDays(ACTIVATION_TOKEN_TTL_DAYS),
        },
      });

      await this.auditService.record(
        {
          organizationId: caller.organizationId,
          actor: caller,
          action: 'INVITATION_RESENT',
          targetType: 'User',
          targetId: user.id,
          targetLabel: `${user.name} (${user.email})`,
          ipAddress,
        },
        tx,
      );
    });

    try {
      await this.mailService.sendActivationEmail(
        user.email,
        rawToken,
        organization?.name ?? 'Your organization',
      );
    } catch {
      // Unlike provision, there is no half-created user to explain here — the
      // account already existed and still does. The old invitation is spent
      // though, so say so plainly rather than implying nothing happened.
      throw new InternalServerErrorException(
        `The invitation for ${user.name} could not be sent. The previous link is no longer valid, so please try again.`,
      );
    }

    return { message: `A new invitation has been sent to ${user.email}.` };
  }

  /**
   * Removes a user without destroying the record.
   *
   * This used to be `prisma.user.delete()` — a real row delete. In Phase 3 that
   * becomes a serious problem: attendance rows hang off userId, so deleting an
   * employee takes their entire attendance history with them. Those records are
   * the evidence behind what someone was paid for which hours, and the law in
   * most places requires keeping them for years after the person leaves. The
   * one moment you need them is a dispute with somebody who has left.
   *
   * So the row stays and the status changes. JwtStrategy already refuses any
   * user who is not ACTIVE, which locks them out of every authenticated route
   * the instant this commits.
   */
  async delete(userId: string, caller: Caller, ipAddress?: string) {
    const user = await this.findManageable(userId, caller, 'delete');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { status: 'DELETED', deletedAt: new Date() },
      });

      // Access tokens die with the status change, but refresh tokens live in
      // their own table and would otherwise keep minting new sessions for a
      // user who no longer exists as far as anyone is concerned.
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revoked: false },
        data: { revoked: true },
      });

      // An unredeemed invitation is a live way back into the account. Burn it,
      // or an employee removed before they ever signed in can still activate.
      await tx.activationToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      // Same reasoning for a reset link already sitting in their inbox.
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      // The most important entry in the table. "Who removed this employee, and
      // when" is the first question asked when a leaver disputes their record,
      // and the user row alone cannot answer it.
      await this.auditService.record(
        {
          organizationId: caller.organizationId,
          actor: caller,
          action: 'USER_DELETED',
          targetType: 'User',
          targetId: user.id,
          targetLabel: `${user.name} (${user.employeeId})`,
          ipAddress,
        },
        tx,
      );
    });

    return { message: `${user.name}'s account has been deleted.` };
  }

  /**
   * Flips a user between ACTIVE and SUSPENDED.
   *
   * PENDING is deliberately outside the cycle. That user has never set a
   * password, so flipping them to ACTIVE would produce an account the users
   * list calls active but that login rejects (it refuses anyone with a null
   * passwordHash). Withdraw an unaccepted invitation with DELETE instead.
   */
  async toggleStatus(userId: string, caller: Caller, ipAddress?: string) {
    const user = await this.findManageable(userId, caller, 'suspend');

    if (user.status === 'PENDING') {
      throw new BadRequestException(
        `${user.name} has not accepted their invitation yet, so there is no active account to suspend.`,
      );
    }

    // Reads as "ACTIVE becomes SUSPENDED, anything else becomes ACTIVE", so it
    // would happily hand a DELETED user a working account back — old password
    // and all. It is safe only because findManageable above refuses to return
    // a DELETED user at all. Keep that filter, or restore this check: a
    // two-way toggle must never be the thing that reinstates someone.
    const nextStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id: user.id },
        data: { status: nextStatus },
      });

      // Access tokens die the moment this commits, because JwtStrategy re-reads
      // status on every request. Refresh tokens are a separate store and would
      // otherwise survive: a suspended user could keep minting new sessions,
      // and re-activating them later would silently restore sessions issued
      // before the suspension.
      if (nextStatus === 'SUSPENDED') {
        await tx.refreshToken.updateMany({
          where: { userId: user.id, revoked: false },
          data: { revoked: true },
        });
      }

      await this.auditService.record(
        {
          organizationId: caller.organizationId,
          actor: caller,
          action:
            nextStatus === 'SUSPENDED' ? 'USER_SUSPENDED' : 'USER_RESTORED',
          targetType: 'User',
          targetId: user.id,
          targetLabel: `${user.name} (${user.employeeId})`,
          ipAddress,
        },
        tx,
      );

      return result;
    });

    return {
      id: updated.id,
      employeeId: updated.employeeId,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      status: updated.status,
    };
  }

  /**
   * Changes a staff record: name, role, department, office (#30).
   *
   * Until this existed there was **no way to alter a user after provisioning**.
   * That was not merely inconvenient: the setup wizard collects name, email and
   * role only, so everybody onboarded during setup had no department and no
   * office and no route to being given one — and a TEAM_LEAD's entire data
   * scope keys off `departmentId`, while an office is what a geo-fenced
   * clock-in is measured against.
   *
   * Reuses `findManageable`, which carries the organization scope, the deleted
   * filter, the self-target refusal and the authority ceiling. Nothing here
   * re-implements any of those.
   */
  async update(
    userId: string,
    dto: UpdateUserDto,
    caller: Caller,
    ipAddress?: string,
  ) {
    const user = await this.findManageable(userId, caller, 'edit');

    // A role change is a second authority question, and the ceiling has to
    // apply to the *destination* as well as the target. Without this an
    // HR_ADMIN — who may edit a TEAM_LEAD — could set that person's role to
    // SUPER_ADMIN and then be administered by someone they just promoted.
    // Exactly the escalation ROLE_AUTHORITY_MATRIX exists to stop at
    // provisioning, arriving through a door that did not exist then.
    if (dto.role !== undefined && dto.role !== user.role) {
      if (!(ROLE_AUTHORITY_MATRIX[caller.role] ?? []).includes(dto.role)) {
        throw new ForbiddenException(
          `A ${caller.role} may not assign the role ${dto.role}`,
        );
      }
    }

    // Scoped to the caller's organization, same as provision: an admin must not
    // be able to attach one of their staff to another tenant's department or
    // office by guessing a UUID. Null is a deliberate clear and skips the check.
    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, organizationId: caller.organizationId },
      });
      if (!department) {
        throw new BadRequestException('Invalid department ID');
      }
    }

    if (dto.officeId) {
      const office = await this.prisma.office.findFirst({
        where: { id: dto.officeId, organizationId: caller.organizationId },
      });
      if (!office) {
        throw new BadRequestException('Invalid office ID');
      }
    }

    // Only the keys actually supplied. Spreading the whole DTO would write
    // `undefined` over columns the caller never mentioned — and for the two
    // nullable ones, `null` and "not supplied" are different instructions.
    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.departmentId !== undefined) {
      data.department = dto.departmentId
        ? { connect: { id: dto.departmentId } }
        : { disconnect: true };
    }
    if (dto.officeId !== undefined) {
      data.office = dto.officeId
        ? { connect: { id: dto.officeId } }
        : { disconnect: true };
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No changes supplied.');
    }

    const changeSummary = describeUserChanges(user, dto);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id: user.id },
        data,
      });

      // A demotion has to end the sessions it demotes. The role is baked into
      // the access token, and refresh tokens are a separate store that would
      // go on minting new ones — so without this, somebody moved from HR_ADMIN
      // to EMPLOYEE keeps administrative access for as long as their browser
      // stays open, and can renew it for the life of the refresh token.
      //
      // Applied to any role change rather than only to demotions: deciding
      // which direction is "safe" means ranking the roles, and that ranking
      // would become a second place role authority is encoded.
      if (dto.role !== undefined && dto.role !== user.role) {
        await tx.refreshToken.updateMany({
          where: { userId: user.id, revoked: false },
          data: { revoked: true },
        });
      }

      await this.auditService.record(
        {
          organizationId: caller.organizationId,
          actor: caller,
          action: 'USER_UPDATED',
          targetType: 'User',
          targetId: user.id,
          // The label records what changed, not only who. "Who altered this
          // record" is answerable from the actor alone; "what did they alter"
          // is the question a disputed role change actually turns on, and the
          // row would otherwise be silent about it.
          targetLabel: `${user.name} (${user.employeeId}) — ${changeSummary}`,
          ipAddress,
        },
        tx,
      );

      return result;
    });

    return {
      id: updated.id,
      employeeId: updated.employeeId,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      status: updated.status,
      departmentId: updated.departmentId,
      officeId: updated.officeId,
    };
  }

  /**
   * Brings a removed employee back (#23).
   *
   * **SUPER_ADMIN only, and always as a fresh invitation.** Both halves were a
   * management decision taken on 24 Sep 2026, not an engineering default, and
   * both have a reason worth keeping:
   *
   * *Super admin only* — an accidental removal and a deliberate one look
   * identical afterwards, so whoever may reinstate may also quietly undo a
   * colleague's decision. Narrow is far easier to widen later than the reverse.
   *
   * *Fresh invitation* — the alternative is silently restoring a password and a
   * permission set that may be a year stale. The person sets a new password and
   * arrives as PENDING, which is what a returning employee actually is.
   *
   * This is deliberately **not** part of `toggleStatus`. That method is a
   * two-way flip whose else-branch produces ACTIVE, so routing a DELETED user
   * through it would hand them their old account back, old password included —
   * see the note there.
   */
  async reinstate(userId: string, caller: Caller, ipAddress?: string) {
    if (userId === caller.id) {
      // Unreachable in practice — a DELETED caller cannot authenticate, since
      // JwtStrategy rejects any status but ACTIVE. Kept because the guarantee
      // that makes it unreachable lives in another file.
      throw new BadRequestException('You cannot reinstate your own account.');
    }

    // Not findManageable: that method filters DELETED users out, which is
    // exactly the set this one operates on.
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId: caller.organizationId,
        status: UserStatus.DELETED,
      },
    });

    if (!user) {
      // Covers three cases on purpose — no such id, another tenant's user, and
      // a user who is not actually removed. Distinguishing them would confirm
      // that an id exists, and the caller's next action is the same regardless.
      throw new NotFoundException('No removed user found with that ID');
    }

    if (caller.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only an organization super admin may reinstate a removed employee.',
      );
    }

    const rawToken = generateToken();

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          status: UserStatus.PENDING,
          deletedAt: null,
          // The old credential does not survive the round trip. Leaving it in
          // place would make this a "fresh invitation" the returning employee
          // could ignore, signing in with a password set before they left.
          passwordHash: null,
          // Their lockout state went with them; starting a new account part of
          // the way to locked would be a confusing welcome.
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });

      await tx.activationToken.create({
        data: {
          tokenHash: hashToken(rawToken),
          userId: user.id,
          expiresAt: expiryInDays(ACTIVATION_TOKEN_TTL_DAYS),
        },
      });

      await this.auditService.record(
        {
          organizationId: caller.organizationId,
          actor: caller,
          action: 'USER_REINSTATED',
          targetType: 'User',
          targetId: user.id,
          targetLabel: `${user.name} (${user.employeeId})`,
          ipAddress,
        },
        tx,
      );
    });

    const organization = await this.prisma.organization.findUnique({
      where: { id: caller.organizationId },
    });

    try {
      await this.mailService.sendActivationEmail(
        user.email,
        rawToken,
        organization?.name ?? 'Your organization',
      );
    } catch {
      // Same reasoning as provision: the row and its token are committed, and
      // rolling back would leave the admin looking at an error and a user who
      // is neither removed nor restored. The account sits PENDING until the
      // invitation is re-sent, which is a path that already exists.
      throw new InternalServerErrorException(
        `${user.name} was reinstated, but the invitation email could not be sent. Re-send it from their profile.`,
      );
    }

    return {
      id: user.id,
      employeeId: user.employeeId,
      name: user.name,
      email: user.email,
      role: user.role,
      status: UserStatus.PENDING,
      message: `${user.name} has been reinstated. An invitation is on its way to ${user.email}.`,
    };
  }

  /**
   * The set of users `caller` is allowed to see, as a Prisma filter.
   *
   * Returns null to mean "nobody" — deliberately not an empty filter, and
   * deliberately not something the caller can mistake for one.
   *
   * SUPER_ADMIN and HR_ADMIN see their whole organization. A TEAM_LEAD sees
   * only their own department: they are an ordinary employee with reporting
   * duties, not an administrator, and the staff directory of the entire
   * company — every colleague's email, employee ID and role — is not theirs
   * to read.
   *
   * The null branch is the whole reason this is a named method rather than an
   * inline `where`. `departmentId` is nullable, so the obvious spelling
   *
   *     { organizationId, departmentId: caller.departmentId }
   *
   * compiles to `WHERE departmentId IS NULL` for an unassigned lead, which
   * matches every user in the organization who has no department — a *wider*
   * leak than the bug this method exists to close. A filter that silently
   * turns into a different filter is worse than no filter, because it looks
   * finished. Handle the null explicitly, or don't handle it at all.
   */
  private visibleUsersWhere(caller: Caller): Prisma.UserWhereInput | null {
    // Deleted users are kept for the record, not for the staff list. Applied
    // here rather than in each branch below so a future role added to this
    // method inherits it instead of having to remember it.
    const organizationScope = {
      organizationId: caller.organizationId,
      status: { not: UserStatus.DELETED },
    };

    if (caller.role !== UserRole.TEAM_LEAD) {
      return organizationScope;
    }

    if (!caller.departmentId) {
      return null;
    }

    return { ...organizationScope, departmentId: caller.departmentId };
  }

  /**
   * One page of the users this caller may see.
   *
   * Used to return every row. One five-thousand-employee customer was a
   * multi-megabyte response serialised in a single tick — the event loop
   * blocked, so requests with nothing to do with this endpoint stalled behind
   * it.
   */
  async findAll(caller: Caller, query: ListUsersDto) {
    const where = this.visibleUsersWhere(caller);
    const { page, limit } = query;

    // No department, nobody to supervise. Answered without a query rather
    // than with one that cannot match — same result, one less round trip.
    if (!where) {
      return this.emptyPage(page, limit);
    }

    const search = query.q?.trim();

    const filter: Prisma.UserWhereInput = search
      ? {
          ...where,
          // Whichever of the three the admin happens to have to hand. Prisma
          // parameterises these, so the input is not concatenated into SQL.
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { employeeId: { contains: search, mode: 'insensitive' } },
          ],
        }
      : where;

    // One transaction so the count and the rows describe the same instant.
    // Read separately, a user created in between makes `total` disagree with
    // what was returned, and the last page flickers.
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where: filter,
        // Ordering is not cosmetic here. Without it Postgres may return rows in
        // any order it likes, so page 2 can repeat rows from page 1 and skip
        // others entirely — pagination would be broken by construction. `id` is
        // the tiebreaker, because names are not unique and two people called
        // Jane Doe would otherwise shuffle between pages.
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: USER_LIST_SELECT,
      }),
      this.prisma.user.count({ where: filter }),
    ]);

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /** Shape-compatible empty page, so callers never special-case "no results". */
  private emptyPage(page: number, limit: number) {
    return { items: [], page, limit, total: 0, totalPages: 1 };
  }
}
