import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { WorkRulesController } from './work-rules.controller';
import { WorkRulesService } from './work-rules.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [WorkRulesController],
  providers: [WorkRulesService],
})
export class WorkRulesModule {}
