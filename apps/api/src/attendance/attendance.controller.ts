import {
  Controller,
  Get,
  Post,
  Request,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { QueryAttendanceHistoryDto } from './dto/query-attendance-history.dto';

interface AuthenticatedRequest {
  user: {
    userId: string;
    email: string;
    role: string;
  };
}

@Controller('attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('clock-in')
  clockIn(@Request() req: AuthenticatedRequest) {
    return this.attendanceService.clockIn(req.user.userId);
  }

  @Post('clock-out')
  @UseGuards(JwtAuthGuard)
  clockOut(@Request() req: AuthenticatedRequest) {
    return this.attendanceService.clockOut(req.user.userId);
  }

  @Post('break-start')
  @UseGuards(JwtAuthGuard)
  startBreak(@Request() req: AuthenticatedRequest) {
    return this.attendanceService.startBreak(req.user.userId);
  }

  @Post('break-end')
  @UseGuards(JwtAuthGuard)
  endBreak(@Request() req: AuthenticatedRequest) {
    return this.attendanceService.endBreak(req.user.userId);
  }

  @Get('today')
  @UseGuards(JwtAuthGuard)
  getTodayAttendance(@Request() req: AuthenticatedRequest) {
    return this.attendanceService.getTodayAttendance(req.user.userId);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  getAttendanceHistory(
    @Request() req: AuthenticatedRequest,
    @Query() query: QueryAttendanceHistoryDto,
  ) {
    return this.attendanceService.getAttendanceHistory(req.user.userId, query);
  }
}
