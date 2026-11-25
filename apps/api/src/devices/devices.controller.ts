import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { DevicesService } from './devices.service';
import {
  IssueChallengeDto,
  ListDevicesDto,
  RegisterDeviceDto,
  RevokeDeviceDto,
} from './dto/device.dto';

interface AuthenticatedRequest {
  user: { id: string; name: string; role: UserRole; organizationId: string };
  ip?: string;
}

/**
 * Registered phones (Phase 4 M2). PRTS §13 names `POST /api/devices/register`;
 * this is the resource form of the same thing, plus the challenge it needs and
 * HR's reset.
 *
 * Registering and challenges act on the CALLER only. HR's routes take a
 * device or user id, always checked against the caller's organisation.
 */
@ApiBearerAuth()
@Controller('devices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post('challenges')
  @HttpCode(HttpStatus.CREATED)
  issueChallenge(
    @Req() req: AuthenticatedRequest,
    @Body() dto: IssueChallengeDto,
  ) {
    return this.devices.issueChallenge(req.user, dto);
  }

  @Post()
  register(@Req() req: AuthenticatedRequest, @Body() dto: RegisterDeviceDto) {
    return this.devices.register(req.user, dto, req.ip);
  }

  @Get('me')
  mine(@Req() req: AuthenticatedRequest) {
    return this.devices.mine(req.user);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  listForUser(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListDevicesDto,
  ) {
    return this.devices.listForUser(req.user, query.userId);
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: RevokeDeviceDto,
  ) {
    return this.devices.revoke(req.user, id, dto, req.ip);
  }
}
