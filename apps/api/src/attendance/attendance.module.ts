import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { DayCloseService } from './day-close.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, DayCloseService],
})
export class AttendanceModule {}
