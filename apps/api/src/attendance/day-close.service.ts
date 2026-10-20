import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { AttendanceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { isHolidayOn, RULE_SELECT, shiftDays } from './attendance-rules';
import { localMoment, toDbDate, type LocalDate } from './attendance-time';
import { planDayClose } from './day-close-plan';

/**
 * Hourly, not nightly. Organisations live in different timezones, so "the day
 * has ended" happens at a different UTC hour for each one; an hourly pass
 * closes each organisation's day within the hour it ends, wherever it is.
 */
const INTERVAL_MS = 60 * 60 * 1000;

/**
 * How many finished days each pass re-checks. More than one so that a server
 * that was down overnight catches up, and so that a holiday entered the next
 * morning still turns yesterday's ABSENT into ON_HOLIDAY. Re-checking is
 * cheap and changes nothing when nothing has changed.
 */
const LOOKBACK_DAYS = 3;

/** Users read per query — an organisation of 5,000 is never loaded at once. */
const USER_BATCH = 500;
const ORG_BATCH = 200;

export interface DayCloseResult {
  organizations: number;
  created: number;
  updated: number;
  absent: number;
  incomplete: number;
}

/**
 * The end-of-day job (Phase 3 M6).
 *
 * Punches only write summaries for days somebody punched, so without this
 * nobody is ever absent and a forgotten clock-out is never flagged. Each pass,
 * for every organisation and each recently finished day, it asks
 * `planDayClose` what each active person's day should say and writes that.
 *
 * Shaped after TokenCleanupService: a `setInterval` started at boot and
 * `unref()`'d, a guard against overlapping runs, and a public method a test
 * drives directly with a fixed `now`.
 *
 * **Idempotent by construction.** New rows go in with `skipDuplicates`, so two
 * instances, a restart mid-run, or the next hourly pass cannot double-write;
 * updates only happen when the plan says a value differs. Running it twice
 * for the same day is a no-op the second time.
 *
 * **It never writes a punch.** An unfinished day is flagged `isIncomplete`
 * (decision 4); the clock-out is left missing for HR to resolve.
 */
@Injectable()
export class DayCloseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DayCloseService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.runPass(), INTERVAL_MS);
    // Never hold the process open — see TokenCleanupService.
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async runPass(): Promise<void> {
    if (this.running) {
      this.logger.warn('Previous day-close still running; skipping.');
      return;
    }
    this.running = true;
    try {
      const r = await this.closeEndedDays();
      if (r.created + r.updated > 0) {
        this.logger.log(
          `Day-close: ${r.created} created, ${r.updated} updated ` +
            `(${r.absent} absent, ${r.incomplete} incomplete) across ${r.organizations} organisation(s).`,
        );
      }
    } catch (error) {
      // Not worth taking the process down: the next pass is an hour away and
      // re-checks the same days.
      this.logger.error(
        `Day-close failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  /**
   * Closes the last LOOKBACK_DAYS finished days, in each organisation's own
   * timezone. `now` is a parameter so tests can fix it — a test that depends on
   * the real clock passes or fails depending on the hour it runs.
   */
  async closeEndedDays(now: Date = new Date()): Promise<DayCloseResult> {
    const total: DayCloseResult = {
      organizations: 0,
      created: 0,
      updated: 0,
      absent: 0,
      incomplete: 0,
    };

    let cursor: string | undefined;
    for (;;) {
      const orgs = await this.prisma.organization.findMany({
        select: { id: true, timezone: true },
        orderBy: { id: 'asc' },
        take: ORG_BATCH,
        ...(cursor && { skip: 1, cursor: { id: cursor } }),
      });
      if (orgs.length === 0) break;

      for (const org of orgs) {
        total.organizations++;
        // "Today" is the organisation's today. Days before it have ended.
        const today = localMoment(now, org.timezone).date;
        for (let back = 1; back <= LOOKBACK_DAYS; back++) {
          const r = await this.closeDay(
            org.id,
            org.timezone,
            shiftDays(today, -back),
          );
          total.created += r.created;
          total.updated += r.updated;
          total.absent += r.absent;
          total.incomplete += r.incomplete;
        }
      }

      if (orgs.length < ORG_BATCH) break;
      cursor = orgs[orgs.length - 1].id;
    }

    return total;
  }

  /** One organisation, one finished local day. */
  async closeDay(organizationId: string, timeZone: string, date: LocalDate) {
    const result = { created: 0, updated: 0, absent: 0, incomplete: 0 };
    const workDate = toDbDate(date);

    const [defaultRule, isHoliday] = await Promise.all([
      this.prisma.workRule.findFirst({
        where: { organizationId, isDefault: true },
        select: RULE_SELECT,
      }),
      isHolidayOn(this.prisma, organizationId, date),
    ]);

    // Every change for this day is collected first and written together with
    // its audit entry in ONE transaction, below — the rule everywhere else in
    // the codebase: an action and the record of it happen together or not at
    // all. Only reads are batched.
    const creates: Prisma.AttendanceSummaryCreateManyInput[] = [];
    const updates: { id: string; data: Prisma.AttendanceSummaryUpdateInput }[] =
      [];

    let cursor: string | undefined;
    for (;;) {
      // Only ACTIVE people can be absent. Suspended, removed and
      // not-yet-activated accounts are not expected at work.
      const users = await this.prisma.user.findMany({
        where: { organizationId, status: 'ACTIVE' },
        select: {
          id: true,
          createdAt: true,
          office: { select: { workRule: { select: RULE_SELECT } } },
        },
        orderBy: { id: 'asc' },
        take: USER_BATCH,
        ...(cursor && { skip: 1, cursor: { id: cursor } }),
      });
      if (users.length === 0) break;

      const ids = users.map((u) => u.id);
      const [punches, existing] = await Promise.all([
        this.prisma.punchEvent.findMany({
          where: { organizationId, userId: { in: ids }, workDate },
          orderBy: { occurredAt: 'asc' },
          select: { userId: true, type: true, occurredAt: true },
        }),
        this.prisma.attendanceSummary.findMany({
          where: { organizationId, userId: { in: ids }, workDate },
          select: { id: true, userId: true, status: true, isIncomplete: true },
        }),
      ]);

      const punchesOf = groupBy(punches, (p) => p.userId);
      const existingOf = new Map(existing.map((s) => [s.userId, s]));

      for (const user of users) {
        const row = existingOf.get(user.id) ?? null;
        const plan = planDayClose({
          date,
          timeZone,
          // Same resolution as the punch path: the office's rule, else the
          // organisation default, else none.
          rule: user.office?.workRule ?? defaultRule,
          isHoliday,
          userCreatedOn: localMoment(user.createdAt, timeZone).date,
          punches: punchesOf.get(user.id) ?? [],
          existing: row,
        });
        if (!plan) continue;

        if (plan.kind === 'create') {
          creates.push({
            ...plan.summary,
            organizationId,
            userId: user.id,
            workDate,
          });
          if (plan.summary.status === AttendanceStatus.ABSENT) result.absent++;
          if (plan.summary.isIncomplete) result.incomplete++;
        } else if (row) {
          updates.push({ id: row.id, data: plan.data });
          if (
            'status' in plan.data &&
            plan.data.status === AttendanceStatus.ABSENT
          )
            result.absent++;
          if ('isIncomplete' in plan.data && plan.data.isIncomplete)
            result.incomplete++;
        }
      }

      if (users.length < USER_BATCH) break;
      cursor = users[users.length - 1].id;
    }

    if (creates.length === 0 && updates.length === 0) return result;

    await this.prisma.$transaction(
      async (tx) => {
        if (creates.length > 0) {
          // skipDuplicates: if another instance wrote this person's row in the
          // meantime, theirs stands — which is what makes concurrent passes
          // harmless.
          const { count } = await tx.attendanceSummary.createMany({
            data: creates,
            skipDuplicates: true,
          });
          result.created = count;
        }
        for (const u of updates) {
          await tx.attendanceSummary.update({
            where: { id: u.id },
            data: u.data,
          });
        }
        result.updated = updates.length;

        // One entry per organisation per day that changed — not one per
        // person, which would bury the trail under a row for every absence.
        await this.audit.record(
          {
            organizationId,
            actor: null, // shown as "System"
            action: 'ATTENDANCE_DAY_CLOSED',
            targetType: 'Organization',
            targetId: organizationId,
            targetLabel:
              `${date}: ${result.absent} absent, ${result.incomplete} incomplete ` +
              `(${result.created} created, ${result.updated} updated)`,
          },
          tx,
        );
      },
      // Large organisations write thousands of rows; give it room, as the
      // punch path does.
      { maxWait: 10_000, timeout: 60_000 },
    );

    return result;
  }
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}
