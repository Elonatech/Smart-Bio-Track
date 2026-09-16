import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateUserDto } from './dto/create-users.dto';
import { ListUsersDto } from './dto/list-users.dto';
import {
  ACTIVATION_RESEND_COOLDOWN_SECONDS,
  ACTIVATION_TOKEN_TTL_DAYS,
  expiryInDays,
  generateToken,
  hashToken,
} from '../common/token.util';
import { generateUniqueEmployeeId } from '../common/employee-id.util';

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
  role: UserRole;
  organizationId: string;
  /** Nullable by schema: a user need not belong to a department. */
  departmentId: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async provision(
    dto: CreateUserDto,
    callerRole: UserRole,
    organizationId: string,
  ) {
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
      dto.employeeId ??
      (await generateUniqueEmployeeId(this.prisma, dto.role));

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
    action: 'suspend' | 'delete' | 'resend the invitation for',
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
  async resendInvitation(userId: string, caller: Caller) {
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
  async delete(userId: string, caller: Caller) {
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
  async toggleStatus(userId: string, caller: Caller) {
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
        select: {
          id: true,
          employeeId: true,
          name: true,
          email: true,
          role: true,
          status: true,
          departmentId: true,
          officeId: true,
          createdAt: true,
        },
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
