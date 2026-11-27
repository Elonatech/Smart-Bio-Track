import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { TrustModule } from '../trust/trust.module';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { DayCloseService } from './day-close.service';

@Module({
  imports: [PrismaModule, AuditModule, TrustModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, DayCloseService],
})
export class AttendanceModule {}
