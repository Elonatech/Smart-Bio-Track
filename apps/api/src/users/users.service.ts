import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateUserDto } from './dto/create-users.dto';
import {
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
      throw new BadRequestException('A user with this email already exists');
    }

    // Only worth checking when the caller supplied one. A generated ID is
    // already guaranteed unused by generateUniqueEmployeeId, which does
    // its own lookup and retries on collision.
    if (dto.employeeId) {
      const existingByEmployeeId = await this.prisma.user.findUnique({
        where: { employeeId: dto.employeeId },
      });

      if (existingByEmployeeId) {
        throw new BadRequestException(
          'A user with this employee ID already exists',
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
    action: 'suspend' | 'delete',
  ) {
    // Suspending yourself locks you out on the next request, since JwtStrategy
    // rejects any user who is not ACTIVE — and nobody is left who can undo it
    // if you were the only admin.
    if (userId === caller.id) {
      throw new BadRequestException(`You cannot ${action} your own account.`);
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: caller.organizationId },
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

  async delete(userId: string, caller: Caller) {
    const user = await this.findManageable(userId, caller, 'delete');

    // Their tokens go with them: onDelete: Cascade on activationToken,
    // refreshToken and passwordResetToken.
    await this.prisma.user.delete({ where: { id: user.id } });

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

  findAll(organizationId: string) {
    return this.prisma.user.findMany({
      where: { organizationId },
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
    });
  }
}
