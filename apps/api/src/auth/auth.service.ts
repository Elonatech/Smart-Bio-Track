import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  JWT_ACCESS_SECRET,
  JWT_ACCESS_EXPIRY,
  JWT_REFRESH_SECRET,
  JWT_REFRESH_EXPIRY,
} from './jwt/jwt.contants';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { CompleteRegistrationDto } from './dto/complete-registration.dto';
import { hashActivationToken } from '../users/activation-token.util';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async createOrganization(dto: CreateOrganizationDto) {
    const {
      organizationName,
      adminEmployeeId,
      adminName,
      email,
      password,
      confirmPassword,
    } = dto;

    // Basic validation
    if (password !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingOrgByName = await this.prisma.organization.findUnique({
      where: { name: organizationName },
    });

    if (existingOrgByName) {
      throw new BadRequestException(
        'An organization with this name already exists',
      );
    }

    const existingOrgByEmail = await this.prisma.organization.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingOrgByEmail) {
      throw new BadRequestException(
        'An organization with this email already exists',
      );
    }

    const existingUserByEmail = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUserByEmail) {
      throw new BadRequestException('A user with this email already exists');
    }

    const existingUserByEmployeeId = await this.prisma.user.findUnique({
      where: { employeeId: adminEmployeeId },
    });

    if (existingUserByEmployeeId) {
      throw new BadRequestException(
        'A user with this employee ID already exists',
      );
    }

    const passwordHash = await argon2.hash(password);

    const user = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: organizationName,
          email: normalizedEmail,
        },
      });

      return tx.user.create({
        data: {
          employeeId: adminEmployeeId,
          name: adminName,
          email: normalizedEmail,
          passwordHash,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          organizationId: organization.id,
        },
      });
    });

    return this.issueTokens(user.id, user.email, user.role);
  }

  // Register
  async register(dto: RegisterDto) {
    const {
      employeeId,
      name,
      email,
      organizationId,
      password,
      confirmPassword,
      role,
      departmentId,
      officeId,
    } = dto;

    // Basic validation
    if (password !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new BadRequestException('A user with this email already exists');
    }

    const existingEmployeeId = await this.prisma.user.findUnique({
      where: { employeeId },
    });

    if (existingEmployeeId) {
      throw new BadRequestException(
        'A user with this employee ID already exists',
      );
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: dto.organizationId },
    });

    if (!organization) {
      throw new BadRequestException('Invalid organization ID');
    }

    if (departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: departmentId },
      });
      if (!department) {
        throw new BadRequestException('Invalid department ID');
      }
    }

    if (officeId) {
      const office = await this.prisma.office.findUnique({
        where: { id: officeId },
      });
      if (!office) {
        throw new BadRequestException('Invalid office ID');
      }
    }

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        employeeId,
        name,
        email: normalizedEmail,
        passwordHash,
        role: role || 'EMPLOYEE',
        status: 'ACTIVE',
        organizationId,
        departmentId,
        officeId,
      },
    });

    return this.issueTokens(user.id, user.email, user.role);
  }

  /**
   * Second half of the provisioning flow: an invited user redeems the
   * activation token they were given and sets their own password, which
   * flips them from PENDING to ACTIVE and logs them straight in.
   */
  async completeRegistration(dto: CompleteRegistrationDto) {
    const { token, password, confirmPassword } = dto;

    if (password !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const stored = await this.prisma.activationToken.findUnique({
      where: { tokenHash: hashActivationToken(token) },
      include: { user: true },
    });

    // One message for every failure mode — a redeemed, expired, or entirely
    // fictional token should be indistinguishable to the caller.
    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired activation token');
    }

    if (stored.user.status !== 'PENDING') {
      throw new BadRequestException('This account has already been activated');
    }

    const passwordHash = await argon2.hash(password);

    const user = await this.prisma.$transaction(async (tx) => {
      const activated = await tx.user.update({
        where: { id: stored.userId },
        data: { passwordHash, status: 'ACTIVE' },
      });

      await tx.activationToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      });

      return activated;
    });

    return this.issueTokens(user.id, user.email, user.role);
  }

  //   Login method
  async login(dto: LoginDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedException('Account is suspended');
    }

    return this.issueTokens(user.id, user.email, user.role);
  }

  // Refresh token method
  async refresh(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    return this.issueTokens(user.id, user.email, user.role);
  }

  private async issueTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };

    const accessToken = this.jwtService.sign(payload, {
      secret: JWT_ACCESS_SECRET,
      expiresIn: JWT_ACCESS_EXPIRY as JwtSignOptions['expiresIn'],
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: JWT_REFRESH_SECRET,
      expiresIn: JWT_REFRESH_EXPIRY as JwtSignOptions['expiresIn'],
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Set expiration to 7 days from now

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }
}
