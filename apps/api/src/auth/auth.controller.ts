import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { ApiBearerAuth } from '@nestjs/swagger';
import { CreatePendingOrganizationDto } from './dto/create-pending-organization.dto';
import { VerifyOrganizationDto } from './dto/verify-organization.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { CompleteRegistrationDto } from './dto/complete-registration.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { Throttle } from '@nestjs/throttler';
import {
  THROTTLE_FORGOT_PASSWORD,
  THROTTLE_LOGIN,
  THROTTLE_ORG_REGISTRATION,
  THROTTLE_REFRESH,
  THROTTLE_RESEND_VERIFICATION,
  THROTTLE_TOKEN_REDEMPTION,
} from '../common/throttle.config';

@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Puts the refresh token in an httpOnly cookie and keeps it out of the
   * response body.
   *
   * Every route that starts a session goes through here, so there is one place
   * that decides how the refresh token travels. Returning it in the body as
   * well would defeat the point entirely — the client would write it back to
   * localStorage and the cookie would be decoration.
   *
   * The access token stays in the body deliberately. It is short-lived and the
   * client needs to read it to set the Authorization header; a cookie it cannot
   * read would be useless for that, and putting it in a cookie is what would
   * expose the data routes to CSRF. See refresh-cookie.ts.
   */
  private issueSession(
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ): { accessToken: string } {
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  /**
   * The refresh token for this request: the cookie a browser sends, or the body
   * field a non-browser client supplies.
   *
   * The cookie wins when both are present. The body path exists for the
   * deferred React Native client (docs/ENGINEERING_REFERENCE.md) — native apps
   * have no browser cookie jar, and their secure storage (Keychain/Keystore)
   * is not readable by injected script the way localStorage is. It does not
   * weaken the browser case: script that cannot read an httpOnly cookie has no
   * token to put in a body.
   */
  private refreshTokenFrom(req: Request, fromBody?: string): string {
    const token = readRefreshCookie(req) ?? fromBody;

    if (!token) {
      throw new UnauthorizedException('No refresh token supplied');
    }

    return token;
  }

  // First half of self-service org signup — email + password only. Sends a
  // verification link; nothing is created yet.
  @Post('register-organization')
  @Throttle(THROTTLE_ORG_REGISTRATION)
  @ResponseMessage('Verification email sent.')
  registerOrganization(@Body() dto: CreatePendingOrganizationDto) {
    return this.authService.createPendingOrganization(dto);
  }

  // Issues a fresh verification link for a signup still awaiting one. Public,
  // and answers identically whether or not the address has a pending signup.
  @Post('resend-organization-verification')
  @Throttle(THROTTLE_RESEND_VERIFICATION)
  @HttpCode(HttpStatus.OK)
  resendOrganizationVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendOrganizationVerification(dto);
  }

  // Second half of self-service org signup — redeems the verification token
  // and the remaining fields (org name, admin name, industry), creating the
  // real Organization + admin User and logging them straight in.
  @Post('verify-organization')
  @Throttle(THROTTLE_TOKEN_REDEMPTION)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Organization verified and registered successfully.')
  async verifyOrganization(
    @Body() dto: VerifyOrganizationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.issueSession(res, await this.authService.verifyOrganization(dto));
  }

  // Second half of the *employee-invite* provisioning flow — the invitee
  // redeems the activation token an admin issued them and sets their own
  // password. Distinct from verify-organization above: this is for staff an
  // admin already created, not a brand-new org signing itself up.
  @Post('complete-registration')
  @Throttle(THROTTLE_TOKEN_REDEMPTION)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Account activated successfully.')
  async completeRegistration(
    @Body() dto: CompleteRegistrationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.issueSession(
      res,
      await this.authService.completeRegistration(dto),
    );
  }

  @Post('login')
  @Throttle(THROTTLE_LOGIN)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Signed in successfully.')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.issueSession(res, await this.authService.login(dto));
  }

  // Rotates the session. The old refresh token is revoked by the service and
  // the replacement is written straight back into the cookie, so a browser
  // client never handles it.
  @Post('refresh')
  @Throttle(THROTTLE_REFRESH)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Session refreshed.')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body('refreshToken') refreshTokenFromBody?: string,
  ) {
    const supplied = this.refreshTokenFrom(req, refreshTokenFromBody);

    try {
      return this.issueSession(res, await this.authService.refresh(supplied));
    } catch (error) {
      // The cookie is spent or invalid. Leaving it in place means the browser
      // replays it on every reload and the client keeps retrying a refresh
      // that cannot succeed.
      clearRefreshCookie(res);
      throw error;
    }
  }

  // Public. Always responds identically whether or not the email is registered,
  // so it cannot be used to discover which addresses have accounts.
  @Post('forgot-password')
  @Throttle(THROTTLE_FORGOT_PASSWORD)
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Throttle(THROTTLE_TOKEN_REDEMPTION)
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // Revokes the supplied refresh token. Requires a valid access token so a
  // third party holding only a stolen refresh token cannot burn someone's
  // session. `all: true` revokes every session for the caller.
  @Post('logout')
  @ResponseMessage('Logged out successfully.')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(
    @Body() dto: LogoutDto,
    @Req() req: Request & { user: { id: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    // `all: true` revokes every session and needs no particular token; a
    // single-session sign-out revokes the one this browser is holding.
    const refreshToken = dto.all
      ? dto.refreshToken
      : this.refreshTokenFrom(req, dto.refreshToken);

    try {
      return await this.authService.logout(req.user.id, {
        ...dto,
        refreshToken,
      });
    } finally {
      // Cleared even if the revoke threw. The token in this browser is being
      // abandoned either way, and leaving a dead cookie behind means the next
      // page load tries to restore a session that no longer exists.
      clearRefreshCookie(res);
    }
  }

  // Returns the authenticated caller's own profile — available to every role
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ResponseMessage('Profile retrieved.')
  me(@Req() req: { user: unknown }) {
    return req.user;
  }

  // Deletes the authenticated caller's account — all sessions are revoked via cascade
  @Delete('account')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Account deleted successfully.')
  deleteAccount(@Req() req: { user: { id: string } }) {
    return this.authService.deleteAccount(req.user.id);
  }

  // Placeholder for an admin-only route to demonstrate role-based access control
  @Get('admin-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'HR_ADMIN')
  adminOnly(@Req() req: { user: unknown }) {
    return { message: 'You are authorized', user: req.user };
  }
}
