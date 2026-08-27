import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { CreatePendingOrganizationDto } from './dto/create-pending-organization.dto';
import { VerifyOrganizationDto } from './dto/verify-organization.dto';
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
  THROTTLE_TOKEN_REDEMPTION,
} from '../common/throttle.config';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // First half of self-service org signup — email + password only. Sends a
  // verification link; nothing is created yet.
  @Post('register-organization')
  @Throttle(THROTTLE_ORG_REGISTRATION)
  @ResponseMessage('Verification email sent.')
  registerOrganization(@Body() dto: CreatePendingOrganizationDto) {
    return this.authService.createPendingOrganization(dto);
  }

  // Second half of self-service org signup — redeems the verification token
  // and the remaining fields (org name, admin name, industry), creating the
  // real Organization + admin User and logging them straight in.
  @Post('verify-organization')
  @Throttle(THROTTLE_TOKEN_REDEMPTION)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Organization verified and registered successfully.')
  verifyOrganization(@Body() dto: VerifyOrganizationDto) {
    return this.authService.verifyOrganization(dto);
  }

  // Second half of the *employee-invite* provisioning flow — the invitee
  // redeems the activation token an admin issued them and sets their own
  // password. Distinct from verify-organization above: this is for staff an
  // admin already created, not a brand-new org signing itself up.
  @Post('complete-registration')
  @Throttle(THROTTLE_TOKEN_REDEMPTION)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Account activated successfully.')
  completeRegistration(@Body() dto: CompleteRegistrationDto) {
    return this.authService.completeRegistration(dto);
  }

  @Post('login')
  @Throttle(THROTTLE_LOGIN)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Signed in successfully.')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @Throttle(THROTTLE_REFRESH)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Session refreshed.')
  refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refresh(refreshToken);
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
  logout(@Body() dto: LogoutDto, @Req() req: { user: { id: string } }) {
    return this.authService.logout(req.user.id, dto);
  }

  // Returns the authenticated caller's own profile — available to every role
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ResponseMessage('Profile retrieved.')
  me(@Req() req: { user: unknown }) {
    return req.user;
  }

  // Placeholder for an admin-only route to demonstrate role-based access control
  @Get('admin-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'HR_ADMIN')
  adminOnly(@Req() req: { user: unknown }) {
    return { message: 'You are authorized', user: req.user };
  }
}
