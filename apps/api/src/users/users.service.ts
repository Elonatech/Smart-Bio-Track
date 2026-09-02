import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
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

/**
 * Which roles each role is allowed to provision.
 *
 * SUPER_ADMIN may create another SUPER_ADMIN so an organization is not left
 * without full control if its founding admin leaves. HR_ADMIN is capped at
 * TEAM_LEAD/EMPLOYEE so it cannot escalate itself or create a peer.
 */
const ROLE_CREATION_MATRIX: Record<UserRole, UserRole[]> = {
  SUPER_ADMIN: ['SUPER_ADMIN', 'HR_ADMIN', 'TEAM_LEAD', 'EMPLOYEE'],
  HR_ADMIN: ['TEAM_LEAD', 'EMPLOYEE'],
  TEAM_LEAD: [],
  EMPLOYEE: [],
};

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
    const allowedRoles = ROLE_CREATION_MATRIX[callerRole] ?? [];

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

    const existingByEmployeeId = await this.prisma.user.findUnique({
      where: { employeeId: dto.employeeId },
    });

    if (existingByEmployeeId) {
      throw new BadRequestException(
        'A user with this employee ID already exists',
      );
    }

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
          employeeId: dto.employeeId,
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
