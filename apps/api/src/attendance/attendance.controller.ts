import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PunchLocationDto } from './dto/punch-location.dto';
import { QueryAttendanceHistoryDto } from './dto/query-attendance-history.dto';

/**
 * PRTS §13's attendance routes, exactly as named there.
 *
 * Every role may punch: administrators and team leads are employees too, and
 * their hours count. What a person may punch is decided by the state machine
 * in the service, never by role.
 *
 * Every route acts on the CALLER only. There is no `:userId` anywhere — HR's
 * views of other people are Phase 5 reports, scoped separately — so there is no
 * identifier here for anyone to change into someone else's.
 */
interface AuthenticatedRequest {
  /**
   * `id`, not `userId`. JwtStrategy.validate() returns MeResponse (#26), whose
   * key is `id`. The original version of this controller read `userId`, which
   * no longer exists — and Prisma treats `{ userId: undefined }` as NO filter,
   * so "my punches" would have quietly returned everyone's.
   */
  user: { id: string; name: string; role: UserRole; organizationId: string };
  ip?: string;
}

@ApiBearerAuth()
@Controller('attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('clock-in')
  clockIn(
    @Req() req: AuthenticatedRequest,
    @Body() location: PunchLocationDto,
  ) {
    return this.attendance.clockIn(req.user, location, req.ip);
  }

  @Post('clock-out')
  clockOut(
    @Req() req: AuthenticatedRequest,
    @Body() location: PunchLocationDto,
  ) {
    return this.attendance.clockOut(req.user, location, req.ip);
  }

  @Post('break-start')
  startBreak(
    @Req() req: AuthenticatedRequest,
    @Body() location: PunchLocationDto,
  ) {
    return this.attendance.startBreak(req.user, location, req.ip);
  }

  @Post('break-end')
  endBreak(
    @Req() req: AuthenticatedRequest,
    @Body() location: PunchLocationDto,
  ) {
    return this.attendance.endBreak(req.user, location, req.ip);
  }

  @Get('today')
  today(@Req() req: AuthenticatedRequest) {
    return this.attendance.today(req.user);
  }

  @Get('history')
  history(
    @Req() req: AuthenticatedRequest,
    @Query() query: QueryAttendanceHistoryDto,
  ) {
    return this.attendance.history(req.user, query);
  }
}
