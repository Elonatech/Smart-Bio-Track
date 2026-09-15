import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TokenCleanupService } from './token-cleanup.service';

/**
 * Background housekeeping. No controllers — nothing here is reachable over
 * HTTP; it runs on a timer inside the process.
 *
 * Deliberately not using @nestjs/schedule. A cron expression would let this run
 * at a fixed off-peak hour rather than "six hours after boot", which is nicer,
 * but it is another dependency in a workspace where `pnpm add` has corrupted
 * pnpm-workspace.yaml before, and the job does not care when it runs. Swapping
 * to @Cron later touches only the lifecycle hooks in TokenCleanupService.
 *
 * Every instance runs its own sweep when the API is scaled out. That is safe —
 * deleting an already-deleted row is a no-op — but it is duplicated work, and
 * the point at which it is worth coordinating is the same point #8 needs Redis
 * for shared rate-limit state.
 */
@Module({
  imports: [PrismaModule],
  providers: [TokenCleanupService],
  exports: [TokenCleanupService],
})
export class MaintenanceModule {}
