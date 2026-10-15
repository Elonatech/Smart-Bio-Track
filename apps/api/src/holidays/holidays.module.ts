import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { HolidaysController } from './holidays.controller';
import { HolidaysService } from './holidays.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [HolidaysController],
  providers: [HolidaysService],
})
export class HolidaysModule {}
