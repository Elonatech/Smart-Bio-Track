import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

/**
 * Exports AuditService so the modules that perform auditable actions can write
 * entries inside their own transactions. UsersModule imports this; anything
 * added in Phase 3 that changes attendance or pay should too.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
