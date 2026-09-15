import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** How often the sweep runs. */
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Rows deleted per statement.
 *
 * `deleteMany` has no LIMIT, so a single call against a table with millions of
 * expired rows is one enormous DELETE: a long-held lock, a spike of WAL, and
 * replication lag behind it. Deleting in bounded pages keeps each statement
 * short and lets ordinary traffic interleave — the job takes longer and nobody
 * notices it running, which is the right trade for maintenance work.
 */
const DELETE_BATCH_SIZE = 5_000;

/** What one sweep removed, by table. */
export interface CleanupResult {
  refreshTokens: number;
  activationTokens: number;
  passwordResetTokens: number;
  pendingOrganizationSignups: number;
}

/**
 * Deletes tokens that have passed their expiry.
 *
 * Nothing removed these before, so all four tables grew forever. RefreshToken
 * is the one that matters: rotation (see AuthService.refresh) writes a new row
 * on every single refresh, so at a 15-minute access-token lifetime each active
 * user produces ~96 rows a day. A few hundred users is a few million rows a
 * month, on a table every authenticated request already reads.
 *
 * WHY EXPIRY IS THE ONLY CONDITION, and specifically why revoked rows are kept
 * until then: refresh-token theft detection depends on a spent token still
 * being *findable*. If a rotated row were deleted as soon as it was revoked, a
 * replayed token would look like an unknown token — a plain 401, with no family
 * revocation, so the thief's own session would survive. Deleting on expiry
 * loses nothing, because `refresh` rejects anything past `expiresAt` before it
 * ever reaches the reuse check.
 *
 * Retention is therefore pinned to REFRESH_TOKEN_TTL_DAYS. If that table ever
 * needs to be smaller, shortening the token lifetime is the honest lever —
 * deleting revoked rows sooner would quietly weaken #11 instead.
 */
@Injectable()
export class TokenCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TokenCleanupService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // `unref()` so this timer never holds the process open. Without it a test
    // run hangs for six hours after the last assertion, and a container
    // refuses to shut down promptly.
    this.timer = setInterval(() => {
      void this.runSweep();
    }, CLEANUP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  /**
   * Wraps the sweep for the timer: never rejects, and never overlaps itself.
   *
   * A sweep that outlives its interval would otherwise start again on top of
   * the previous one, and two concurrent batched deletes contend for the same
   * rows to no benefit.
   */
  private async runSweep(): Promise<void> {
    if (this.running) {
      this.logger.warn('Previous token cleanup still running; skipping.');
      return;
    }

    this.running = true;

    try {
      const result = await this.cleanupExpiredTokens();
      const total =
        result.refreshTokens +
        result.activationTokens +
        result.passwordResetTokens +
        result.pendingOrganizationSignups;

      if (total > 0) {
        this.logger.log(
          `Token cleanup removed ${total} expired row(s): ` +
            `${result.refreshTokens} refresh, ${result.activationTokens} activation, ` +
            `${result.passwordResetTokens} reset, ${result.pendingOrganizationSignups} pending signup.`,
        );
      }
    } catch (error) {
      // A failed sweep is not worth taking the process down for — the next one
      // is six hours away and the only cost is a larger table meanwhile.
      this.logger.error(
        `Token cleanup failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }

  /**
   * Removes every expired row across the four token tables.
   *
   * Public and returning counts so it can be driven directly from a test, or
   * later from an admin endpoint, without waiting on the timer.
   */
  async cleanupExpiredTokens(now: Date = new Date()): Promise<CleanupResult> {
    return {
      refreshTokens: await this.deleteExpired('refreshToken', now),
      activationTokens: await this.deleteExpired('activationToken', now),
      passwordResetTokens: await this.deleteExpired('passwordResetToken', now),
      // Holds a passwordHash for an abandoned signup, so clearing these is
      // data minimisation as much as housekeeping.
      pendingOrganizationSignups: await this.deleteExpired(
        'pendingOrganizationSignup',
        now,
      ),
    };
  }

  /**
   * Deletes expired rows from one table, a page at a time.
   *
   * Ids are selected first and deleted by id rather than re-running the
   * predicate: a bare `deleteMany` with a LIMIT is not expressible in Prisma,
   * and matching on the primary key keeps each delete on an index.
   */
  private async deleteExpired(
    table:
      | 'refreshToken'
      | 'activationToken'
      | 'passwordResetToken'
      | 'pendingOrganizationSignup',
    now: Date,
  ): Promise<number> {
    const model = this.prisma[table] as {
      findMany: (args: unknown) => Promise<{ id: string }[]>;
      deleteMany: (args: unknown) => Promise<{ count: number }>;
    };

    let removed = 0;

    for (;;) {
      const expired = await model.findMany({
        where: { expiresAt: { lt: now } },
        select: { id: true },
        take: DELETE_BATCH_SIZE,
      });

      if (expired.length === 0) {
        break;
      }

      const { count } = await model.deleteMany({
        where: { id: { in: expired.map((row) => row.id) } },
      });

      removed += count;

      // A short final page means the table is drained. Checking this rather
      // than looping until zero saves one wasted query per table per sweep.
      if (expired.length < DELETE_BATCH_SIZE) {
        break;
      }
    }

    return removed;
  }
}
