import { AttendanceStatus, OvertimeBasis, PunchType } from '@prisma/client';
import { isoWeekday, localMoment, type LocalDate } from './attendance-time';

/**
 * The daily summary as a pure function of its inputs (Phase 3 design rule 5).
 *
 * No database, no clock, no "now". Everything it needs is passed in, so every
 * rule in FR-005/FR-006 is checked by a table of cases in day-summary.spec.ts,
 * and a summary can be recomputed from the punches at any time and come out
 * the same. AttendanceSummary is only ever written from this function's output.
 */

/**
 * Phase 3 decision 3: breaks are UNPAID — subtracted from working time.
 *
 * FR-004 says break duration "shall automatically contribute toward working
 * hours calculations", which reads either way. This is our reading, pending
 * management confirmation, because it changes pay. It is deliberately the only
 * place the choice is made: flipping it is this line plus a recompute.
 */
export const BREAKS_ARE_PAID = false;

export interface PunchInput {
  type: PunchType;
  occurredAt: Date;
}

/** The parts of a WorkRule the arithmetic uses — also what gets snapshotted. */
export interface RuleSnapshot {
  id: string | null;
  workingDays: readonly number[];
  startMinutes: number;
  endMinutes: number;
  gracePeriodMinutes: number;
  /**
   * How overtime is counted (decided 27 Oct 2026 — see overtimeFor below):
   * END_TIME = time worked after the rule's end ("9 to 5, anything after 5pm");
   * DAILY_HOURS = worked time beyond overtimeAfterMinutes ("8 hours a day");
   * NONE = not tracked.
   */
  overtimeBasis: OvertimeBasis;
  /** Only meaningful for DAILY_HOURS. */
  overtimeAfterMinutes: number | null;
}

export interface DaySummaryInput {
  workDate: LocalDate;
  timeZone: string;
  /** That day's punches, oldest first. */
  punches: readonly PunchInput[];
  /** The rule in force, or null when the organisation has configured none. */
  rule: RuleSnapshot | null;
  isHoliday: boolean;
  /**
   * True once the day is over (the end-of-day job, M6). Only then does an
   * unfinished session count as incomplete — during the day, still being
   * clocked in is simply where someone is.
   */
  dayClosed: boolean;
}

export interface DaySummary {
  status: AttendanceStatus;
  firstClockIn: Date | null;
  lastClockOut: Date | null;
  workedMinutes: number;
  breakMinutes: number;
  overtimeMinutes: number;
  isLate: boolean;
  lateMinutes: number;
  isIncomplete: boolean;
  workRuleId: string | null;
  scheduledStartMinutes: number | null;
  scheduledEndMinutes: number | null;
  gracePeriodMinutes: number | null;
}

const MINUTE_MS = 60_000;

/**
 * Null when there is nothing to record: no punches, no holiday, and no rule to
 * say the day was a working one. That is the honest answer for an organisation
 * that has not configured its hours — nobody is late, and nobody is absent.
 */
export function computeDaySummary(input: DaySummaryInput): DaySummary | null {
  const { punches, rule, isHoliday, workDate, timeZone, dayClosed } = input;

  const isWorkingDay =
    rule !== null && rule.workingDays.includes(isoWeekday(workDate));

  // ── walk the punches as alternating work and break segments ──────────────
  //
  // Each segment is closed by the punch that ends it. A session still open
  // when the punches run out contributes nothing yet: the minutes are not
  // known until it ends, and guessing them is how a summary goes wrong.
  let workMs = 0;
  let breakMs = 0;
  /** Each closed work segment — END_TIME overtime needs WHEN work happened. */
  const workSegments: { from: Date; to: Date }[] = [];
  let workStartedAt: Date | null = null;
  let breakStartedAt: Date | null = null;
  let firstClockIn: Date | null = null;
  let lastClockOut: Date | null = null;

  for (const punch of punches) {
    const t = punch.occurredAt;
    switch (punch.type) {
      case PunchType.CLOCK_IN:
        firstClockIn ??= t;
        workStartedAt = t;
        break;

      case PunchType.BREAK_START:
        // The time before the break was WORK. (The service this replaced
        // added it to break time, so an 08:00–17:00 day with an hour's
        // lunch showed four hours of break.)
        if (workStartedAt) {
          workMs += t.getTime() - workStartedAt.getTime();
          workSegments.push({ from: workStartedAt, to: t });
        }
        workStartedAt = null;
        breakStartedAt = t;
        break;

      case PunchType.BREAK_END:
        if (breakStartedAt) breakMs += t.getTime() - breakStartedAt.getTime();
        breakStartedAt = null;
        workStartedAt = t;
        break;

      case PunchType.CLOCK_OUT:
        if (workStartedAt) {
          workMs += t.getTime() - workStartedAt.getTime();
          workSegments.push({ from: workStartedAt, to: t });
        }
        workStartedAt = null;
        lastClockOut = t;
        break;
    }
  }

  const sessionStillOpen = workStartedAt !== null || breakStartedAt !== null;

  // Floor, not round: a part-minute is not a minute worked.
  const breakMinutes = Math.floor(breakMs / MINUTE_MS);
  const workedMinutes =
    Math.floor(workMs / MINUTE_MS) + (BREAKS_ARE_PAID ? breakMinutes : 0);

  // ── lateness (FR-006) ───────────────────────────────────────────────────
  //
  // Counted from the END of the grace period: start 08:00, grace 10, in at
  // 08:13 → 3 minutes late, not 13. Judged on the FIRST clock-in only — coming
  // back from an errand at 14:00 is not lateness. Not judged at all on a rest
  // day, a holiday, or when no rule exists.
  let lateMinutes = 0;
  if (firstClockIn && rule && isWorkingDay && !isHoliday) {
    const arrivedAt = localMoment(firstClockIn, timeZone).minutes;
    lateMinutes = Math.max(
      0,
      arrivedAt - (rule.startMinutes + rule.gracePeriodMinutes),
    );
  }

  const overtimeMinutes = rule
    ? overtimeFor(rule, workedMinutes, workSegments, timeZone)
    : 0;

  // ── status ──────────────────────────────────────────────────────────────
  let status: AttendanceStatus;
  if (firstClockIn) {
    // Working on a holiday or a rest day is still being present; it is just
    // never late.
    status = AttendanceStatus.PRESENT;
  } else if (isHoliday) {
    status = AttendanceStatus.ON_HOLIDAY;
  } else if (rule && !isWorkingDay) {
    status = AttendanceStatus.REST_DAY;
  } else if (rule) {
    status = AttendanceStatus.ABSENT;
  } else {
    return null;
  }

  return {
    status,
    firstClockIn,
    lastClockOut,
    workedMinutes,
    breakMinutes,
    overtimeMinutes,
    isLate: lateMinutes > 0,
    lateMinutes,
    isIncomplete: dayClosed && sessionStillOpen,
    workRuleId: rule?.id ?? null,
    scheduledStartMinutes: rule?.startMinutes ?? null,
    scheduledEndMinutes: rule?.endMinutes ?? null,
    gracePeriodMinutes: rule?.gracePeriodMinutes ?? null,
  };
}

const DAY_MS = 1440 * MINUTE_MS;

/**
 * Overtime, by the rule's chosen basis (Enoch, 27 Oct 2026: "work is set from
 * 9 to 5, anything after 5pm is tagged as overtime ... can it be flexible, cos
 * if a company says you should work 8 hours a day").
 *
 * END_TIME counts only WORK segments falling after the rule's end — a break
 * taken after 17:00 is not overtime, and someone who arrived late and stayed
 * until 17:00 has none. It is counted whether or not the person was late or
 * worked a full day: time after the end is overtime, full stop.
 *
 * DAILY_HOURS is worked time beyond the threshold, wherever in the day it fell.
 */
function overtimeFor(
  rule: RuleSnapshot,
  workedMinutes: number,
  segments: readonly { from: Date; to: Date }[],
  timeZone: string,
): number {
  switch (rule.overtimeBasis) {
    case OvertimeBasis.NONE:
      return 0;

    case OvertimeBasis.DAILY_HOURS:
      return rule.overtimeAfterMinutes == null
        ? 0
        : Math.max(0, workedMinutes - rule.overtimeAfterMinutes);

    case OvertimeBasis.END_TIME: {
      const boundary = rule.endMinutes * MINUTE_MS;
      let afterEndMs = 0;
      for (const { from, to } of segments) {
        // Position within the local day, to the millisecond. Seconds are the
        // same in every zone (offsets are whole minutes), so the local minute
        // plus the UTC seconds is the local time exactly.
        const start =
          localMoment(from, timeZone).minutes * MINUTE_MS +
          from.getUTCSeconds() * 1000 +
          from.getUTCMilliseconds();
        const end = start + (to.getTime() - from.getTime());
        afterEndMs += Math.max(
          0,
          Math.min(end, DAY_MS) - Math.max(start, boundary),
        );
      }
      return Math.floor(afterEndMs / MINUTE_MS);
    }
  }
}
