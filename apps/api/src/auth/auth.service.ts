import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import {
  JWT_ACCESS_SECRET,
  JWT_ACCESS_EXPIRY,
  JWT_REFRESH_SECRET,
  JWT_REFRESH_EXPIRY,
} from './jwt/jwt.contants';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { CompleteRegistrationDto } from './dto/complete-registration.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  PASSWORD_RESET_TOKEN_TTL_MINUTES,
  REFRESH_TOKEN_TTL_DAYS,
  expiryInDays,
  expiryInMinutes,
  generateToken,
  hashToken,
} from '../common/token.util';

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
      where: { tokenHash: hashToken(token) },
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

  /**
   * PRTS FR-001 — accepts an Employee ID or an email address in `identifier`.
   * The presence of "@" decides which; the client does not get to declare it.
   */
  async login(dto: LoginDto) {
    const identifier = dto.identifier.trim();

    const user = identifier.includes('@')
      ? await this.prisma.user.findUnique({
          where: { email: identifier.toLowerCase() },
        })
      : await this.prisma.user.findUnique({
          where: { employeeId: identifier },
        });

    // A PENDING user has no passwordHash yet, so this also covers "invited but
    // never activated" without leaking that the account exists.
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
      where: { tokenHash: hashToken(refreshToken) },
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

  /**
   * Revokes refresh tokens for a user. Access tokens are stateless and cannot
   * be recalled, so one may remain usable until it expires (15 minutes by
   * default) — revoking the refresh token is what stops the session renewing
   * beyond that.
   */
  async logout(userId: string, dto: LogoutDto) {
    if (dto.all) {
      const { count } = await this.prisma.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true },
      });
      return { message: `Signed out of ${count} session(s)` };
    }

    if (!dto.refreshToken) {
      throw new BadRequestException(
        'A refreshToken is required unless "all" is true',
      );
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(dto.refreshToken) },
    });

    // Only revoke a token that belongs to the caller — otherwise anyone with a
    // valid access token could revoke another user's session.
    if (!stored || stored.userId !== userId) {
      throw new BadRequestException('Invalid refresh token');
    }

    if (!stored.revoked) {
      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revoked: true },
      });
    }

    return { message: 'Signed out' };
  }

  /**
   * Issues a password-reset token.
   *
   * Always returns the same message whether or not the email matches an
   * account — otherwise this endpoint becomes a way to enumerate which email
   * addresses are registered.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const genericResponse = {
      message:
        'If an account exists for that email, a reset link has been sent.',
    };

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    // Unknown address, or an invited user who never set a password — nothing
    // to reset in either case, but the caller cannot tell the difference.
    if (!user || user.status !== 'ACTIVE') {
      return genericResponse;
    }

    const rawToken = generateToken();

    await this.prisma.$transaction(async (tx) => {
      // Any earlier unused token for this user stops working the moment a new
      // one is requested.
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      await tx.passwordResetToken.create({
        data: {
          tokenHash: hashToken(rawToken),
          userId: user.id,
          expiresAt: expiryInMinutes(PASSWORD_RESET_TOKEN_TTL_MINUTES),
        },
      });
    });

    return {
      ...genericResponse,
      // TEMPORARY: no email service exists yet, so the token is returned
      // directly. This MUST be removed once notifications ship — until then
      // anyone can request a reset for a known address and read the token.
      resetToken: rawToken,
    };
  }

  /**
   * Redeems a password-reset token. Signs the user out of every existing
   * session, since a password reset usually means the old one was compromised.
   */
  async resetPassword(dto: ResetPasswordDto) {
    const { token, password, confirmPassword } = dto;

    if (password !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });

    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await argon2.hash(password);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: stored.userId },
        data: { passwordHash },
      });

      await tx.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      });

      await tx.refreshToken.updateMany({
        where: { userId: stored.userId, revoked: false },
        data: { revoked: true },
      });
    });

    return { message: 'Password has been reset. Please sign in again.' };
  }

  private async issueTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };

    const accessToken = this.jwtService.sign(
      { ...payload, jti: randomUUID() },
      {
        secret: JWT_ACCESS_SECRET,
        expiresIn: JWT_ACCESS_EXPIRY as JwtSignOptions['expiresIn'],
      },
    );

    // `jti` is not decoration. Without it the payload is just
    // { sub, email, role } plus JWT's own `iat`, which has one-second
    // resolution — so two logins by the same user inside the same second
    // produce byte-identical tokens, an identical SHA-256, and a unique
    // constraint violation on tokenHash (a 500 to the caller). That is a
    // double-clicked sign-in button, and it reached us as a real failure.
    const refreshToken = this.jwtService.sign(
      { ...payload, jti: randomUUID() },
      {
        secret: JWT_REFRESH_SECRET,
        expiresIn: JWT_REFRESH_EXPIRY as JwtSignOptions['expiresIn'],
      },
    );

    // Only the digest is persisted — the raw refresh token exists solely in
    // this response and in the client's storage.
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        userId,
        expiresAt: expiryInDays(REFRESH_TOKEN_TTL_DAYS),
      },
    });

    return { accessToken, refreshToken };
  }
}
