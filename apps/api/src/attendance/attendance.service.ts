import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PunchType, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type AuditAction } from '../audit/audit.service';
import {
  refusalFor,
  stateFromPunches,
  type AttendanceState,
} from './attendance-state';
import { computeDaySummary, type RuleSnapshot } from './day-summary';
import {
  fromDbDate,
  localMoment,
  toDbDate,
  type LocalDate,
} from './attendance-time';
import type { PunchLocationDto } from './dto/punch-location.dto';
import type { QueryAttendanceHistoryDto } from './dto/query-attendance-history.dto';

/**
 * Clock-in, clock-out and breaks (FR-002–FR-005), and the employee's own view
 * of today and their history (FR-008).
 *
 * Built on Emmanuel's original module (routes, state checks, the "no rule
 * means not late" principle) and rebuilt for the Phase 3 design rules in
 * docs/phase-notes/phase-3-attendance-plan.md §4:
 *
 *  1. Server time only — taken after the lock, inside the transaction.
 *  2. The state check and the write happen under a row lock in ONE
 *     transaction, so two fast taps cannot both clock in.
 *  3. Punches are append-only (the database enforces it; nothing here tries).
 *  4. The summary is recomputed from the day's punches on every punch.
 *  5. The arithmetic lives in computeDaySummary, a pure function.
 *  6. Every query is scoped to the caller's organisation.
 *  7. Every punch is audited in the same transaction.
 *
 * Phase 4 adds the trust checks (biometrics, device, geo-fence enforcement)
 * in front of `punch`; nothing here pretends to do them.
 */

export interface AttendanceCaller {
  id: string;
  name: string;
  role: UserRole;
  organizationId: string;
}

const AUDIT_ACTION: Record<PunchType, AuditAction> = {
  CLOCK_IN: 'CLOCK_IN',
  CLOCK_OUT: 'CLOCK_OUT',
  BREAK_START: 'BREAK_START',
  BREAK_END: 'BREAK_END',
};

/**
 * What the API returns for a punch. Location is recorded but not echoed back
 * — the caller already knows where they are, and the field exists for Phase
 * 4's checks and the audit trail, not for display.
 */
const PUNCH_SELECT = {
  id: true,
  type: true,
  occurredAt: true,
} satisfies Prisma.PunchEventSelect;

const SUMMARY_SELECT = {
  workDate: true,
  status: true,
  firstClockIn: true,
  lastClockOut: true,
  workedMinutes: true,
  breakMinutes: true,
  overtimeMinutes: true,
  isLate: true,
  lateMinutes: true,
  isIncomplete: true,
  scheduledStartMinutes: true,
  scheduledEndMinutes: true,
  gracePeriodMinutes: true,
} satisfies Prisma.AttendanceSummarySelect;

const RULE_SELECT = {
  id: true,
  workingDays: true,
  startMinutes: true,
  endMinutes: true,
  gracePeriodMinutes: true,
  overtimeAfterMinutes: true,
} satisfies Prisma.WorkRuleSelect;

/** History is a screen, not an export — payroll ranges are Phase 5. */
const MAX_HISTORY_DAYS = 93;
const DEFAULT_HISTORY_DAYS = 30;

/**
 * Generous on purpose. The transaction is six short queries (~1.2 s at the
 * ~200 ms per query this office sees to Neon), and Prisma's 5 s default has
 * already timed out once on a bad-network day in Phase 2. A lock held a few
 * seconds longer is cheap; a punch refused because the network was slow is
 * an employee who cannot clock in.
 */
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  clockIn(caller: AttendanceCaller, location?: PunchLocationDto, ip?: string) {
    return this.punch(caller, PunchType.CLOCK_IN, location, ip);
  }

  clockOut(caller: AttendanceCaller, location?: PunchLocationDto, ip?: string) {
    return this.punch(caller, PunchType.CLOCK_OUT, location, ip);
  }

  startBreak(
    caller: AttendanceCaller,
    location?: PunchLocationDto,
    ip?: string,
  ) {
    return this.punch(caller, PunchType.BREAK_START, location, ip);
  }

  endBreak(caller: AttendanceCaller, location?: PunchLocationDto, ip?: string) {
    return this.punch(caller, PunchType.BREAK_END, location, ip);
  }

  /** Today, in the organisation's timezone: state, punches so far, summary. */
  async today(caller: AttendanceCaller) {
    const { timeZone } = await this.contextFor(caller);
    const date = localMoment(new Date(), timeZone).date;
    const workDate = toDbDate(date);

    const [punches, summary] = await Promise.all([
      this.prisma.punchEvent.findMany({
        where: {
          organizationId: caller.organizationId,
          userId: caller.id,
          workDate,
        },
        orderBy: { occurredAt: 'asc' },
        select: PUNCH_SELECT,
      }),
      this.prisma.attendanceSummary.findFirst({
        where: {
          organizationId: caller.organizationId,
          userId: caller.id,
          workDate,
        },
        select: SUMMARY_SELECT,
      }),
    ]);

    return {
      workDate: date,
      timeZone,
      state: stateFromPunches(punches),
      punches,
      summary: summary && this.presentSummary(summary),
    };
  }

  /** The caller's own daily summaries, newest first. */
  async history(caller: AttendanceCaller, query: QueryAttendanceHistoryDto) {
    const { timeZone } = await this.contextFor(caller);
    const today = localMoment(new Date(), timeZone).date;

    const to = query.to ?? today;
    const from = query.from ?? shiftDays(to, -(DEFAULT_HISTORY_DAYS - 1));

    // The DTO's pattern accepts 2026-02-31; JavaScript would quietly read it
    // as 3 March. Round-tripping catches any date that does not exist.
    for (const d of [from, to]) {
      if (shiftDays(d, 0) !== d) {
        throw new BadRequestException(`${d} is not a real date.`);
      }
    }
    if (from > to) {
      throw new BadRequestException('"from" must not be after "to".');
    }
    if (daysBetween(from, to) + 1 > MAX_HISTORY_DAYS) {
      throw new BadRequestException(
        `History is limited to ${MAX_HISTORY_DAYS} days at a time.`,
      );
    }

    const summaries = await this.prisma.attendanceSummary.findMany({
      where: {
        organizationId: caller.organizationId,
        userId: caller.id,
        workDate: { gte: toDbDate(from), lte: toDbDate(to) },
      },
      orderBy: { workDate: 'desc' },
      select: SUMMARY_SELECT,
    });

    return {
      from,
      to,
      timeZone,
      days: summaries.map((s) => this.presentSummary(s)),
    };
  }

  // ─── the one write path ──────────────────────────────────────────────────

  private async punch(
    caller: AttendanceCaller,
    type: PunchType,
    location: PunchLocationDto | undefined,
    ip: string | undefined,
  ) {
    // Read-only and slow-changing, so outside the lock: which timezone, which
    // rule. Holding a row lock across these would only lengthen the window in
    // which a second tap waits.
    const { timeZone, rule } = await this.contextFor(caller);

    return this.prisma.$transaction(async (tx) => {
      // Lock this user's row for the rest of the transaction. A second punch
      // from the same person — a double tap, two tabs — waits here until the
      // first commits, then reads the punch the first one wrote. Without it,
      // both read "not clocked in", both pass the check, and both insert
      // (Phase 2 #9 lost updates the same way until it was made atomic).
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "User"
        WHERE id = ${caller.id} AND "organizationId" = ${caller.organizationId}
        FOR UPDATE
      `;
      if (locked.length === 0) {
        throw new NotFoundException('User not found');
      }

      // The clock is read AFTER the lock. Read before it, a request that
      // waited behind another could record an earlier time than the punch it
      // queued behind, and the day's punches would be out of order.
      const now = new Date();
      const date = localMoment(now, timeZone).date;
      const workDate = toDbDate(date);

      const [punches, isHoliday] = await Promise.all([
        tx.punchEvent.findMany({
          where: {
            organizationId: caller.organizationId,
            userId: caller.id,
            workDate,
          },
          orderBy: { occurredAt: 'asc' },
          select: { type: true, occurredAt: true },
        }),
        this.isHoliday(tx, caller.organizationId, date),
      ]);

      const refusal = refusalFor(stateFromPunches(punches), type);
      if (refusal) {
        throw new ConflictException(refusal);
      }

      const punch = await tx.punchEvent.create({
        data: {
          organizationId: caller.organizationId,
          userId: caller.id,
          type,
          occurredAt: now,
          workDate,
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
          accuracyMeters: location?.accuracyMeters ?? null,
        },
        select: PUNCH_SELECT,
      });

      const dayPunches = [...punches, { type, occurredAt: now }];

      // Never null here: every allowed punch sequence starts with a clock-in,
      // and a day with a clock-in always produces a PRESENT summary.
      const computed = computeDaySummary({
        workDate: date,
        timeZone,
        punches: dayPunches,
        rule,
        isHoliday,
        dayClosed: false,
      })!;

      const summary = await tx.attendanceSummary.upsert({
        where: { userId_workDate: { userId: caller.id, workDate } },
        create: {
          ...computed,
          organizationId: caller.organizationId,
          userId: caller.id,
          workDate,
        },
        update: computed,
        select: SUMMARY_SELECT,
      });

      await this.audit.record(
        {
          organizationId: caller.organizationId,
          actor: { id: caller.id, name: caller.name, role: caller.role },
          action: AUDIT_ACTION[type],
          targetType: 'PunchEvent',
          targetId: punch.id,
          targetLabel: caller.name,
          ipAddress: ip,
        },
        tx,
      );

      return {
        state: stateFromPunches(dayPunches) satisfies AttendanceState,
        punch,
        summary: this.presentSummary(summary),
      };
    }, TRANSACTION_OPTIONS);
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  /**
   * The organisation's timezone and the rule this person is judged against.
   *
   * Rule resolution (Phase 3 decision 2): the office's rule if it has one,
   * otherwise the organisation's default, otherwise none — and with none,
   * nobody is late. Department-specific rules, which Emmanuel's original
   * design had, are an open question for M2.
   */
  private async contextFor(caller: AttendanceCaller): Promise<{
    timeZone: string;
    rule: RuleSnapshot | null;
  }> {
    const user = await this.prisma.user.findFirst({
      where: { id: caller.id, organizationId: caller.organizationId },
      select: {
        organization: { select: { timezone: true } },
        office: { select: { workRule: { select: RULE_SELECT } } },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const rule =
      user.office?.workRule ??
      (await this.prisma.workRule.findFirst({
        where: { organizationId: caller.organizationId, isDefault: true },
        select: RULE_SELECT,
      }));

    return { timeZone: user.organization.timezone, rule };
  }

  /**
   * Whether `date` is a holiday: an exact match, or an annual holiday on the
   * same month and day in any year. Annual ones are few per organisation, so
   * they are filtered here rather than with date arithmetic in SQL.
   */
  private async isHoliday(
    tx: Prisma.TransactionClient,
    organizationId: string,
    date: LocalDate,
  ): Promise<boolean> {
    const candidates = await tx.holiday.findMany({
      where: {
        organizationId,
        OR: [{ date: toDbDate(date) }, { repeatsAnnually: true }],
      },
      select: { date: true, repeatsAnnually: true },
    });

    const monthDay = date.slice(5);
    return candidates.some((h) => {
      const d = fromDbDate(h.date);
      return d === date || (h.repeatsAnnually && d.slice(5) === monthDay);
    });
  }

  /** A `@db.Date` comes back as a Date at UTC midnight; send the plain date. */
  private presentSummary<T extends { workDate: Date }>(summary: T) {
    return { ...summary, workDate: fromDbDate(summary.workDate) };
  }
}

function shiftDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}
