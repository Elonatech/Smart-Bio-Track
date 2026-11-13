import { AttendanceStatus } from '@prisma/client';
import {
  computeDaySummary,
  type DaySummary,
  type PunchInput,
  type RuleSnapshot,
} from './day-summary';
import type { LocalDate } from './attendance-time';

/**
 * What the end-of-day job should do for one person on one finished day.
 *
 * A pure function, like computeDaySummary, so every case below is a unit test
 * rather than a database fixture. The job (day-close.service.ts) only reads
 * the inputs and applies the answer.
 *
 * The three situations, and why each is handled the way it is:
 *
 *  1. **The day has punches** (so a summary already exists — every punch writes
 *     one). Only `isIncomplete` may change: someone still clocked in or on a
 *     break when the day ended is flagged (Phase 3 decision 4). Nothing else on
 *     the row is touched — in particular not lateness, which was judged against
 *     the rule *at the time* and snapshotted. Recomputing it here with
 *     today's rule would let a rule change quietly rewrite yesterday.
 *
 *  2. **No punches, and no summary yet.** Write the day as the rule sees it:
 *     ABSENT on a working day, ON_HOLIDAY on a holiday, REST_DAY otherwise —
 *     unless the person did not exist yet that day, or no rule exists (nobody
 *     is absent from hours that were never set).
 *
 *  3. **No punches, summary already written** by an earlier run. Re-evaluate
 *     the status, because the job re-checks recent days: a holiday entered the
 *     next morning should turn yesterday's ABSENT into ON_HOLIDAY. Safe to
 *     recompute, because a day with no punches has no lateness to rewrite.
 *
 * Never, in any case, does this produce a punch. An unfinished day is
 * flagged; a clock-out is never invented.
 */

export interface DayCloseInput {
  date: LocalDate;
  timeZone: string;
  rule: RuleSnapshot | null;
  isHoliday: boolean;
  /** The local date the person's account was created. */
  userCreatedOn: LocalDate;
  punches: readonly PunchInput[];
  existing: { status: AttendanceStatus; isIncomplete: boolean } | null;
}

export type DayClosePlan =
  | { kind: 'create'; summary: DaySummary }
  | {
      kind: 'update';
      data: { isIncomplete: boolean } | { status: AttendanceStatus };
    }
  | null;

export function planDayClose(input: DayCloseInput): DayClosePlan {
  const computed = computeDaySummary({
    workDate: input.date,
    timeZone: input.timeZone,
    punches: input.punches,
    rule: input.rule,
    isHoliday: input.isHoliday,
    dayClosed: true,
  });

  // 1. A day with punches: only the incomplete flag.
  if (input.punches.length > 0) {
    if (!computed) return null; // unreachable: punches always yield PRESENT
    if (!input.existing) {
      // Defensive — every punch writes its summary in the same transaction,
      // so this means one was lost. Rebuilding it from the punches is exactly
      // what "derived and rebuildable" is for.
      return { kind: 'create', summary: computed };
    }
    return input.existing.isIncomplete === computed.isIncomplete
      ? null
      : { kind: 'update', data: { isIncomplete: computed.isIncomplete } };
  }

  // 3. No punches, row already written by an earlier run.
  if (input.existing) {
    if (!computed || computed.status === input.existing.status) return null;
    return { kind: 'update', data: { status: computed.status } };
  }

  // 2. No punches, nothing written yet.
  //
  // Created on or after this day means they were not expected to work it:
  // someone invited at 14:00 was not absent that morning. (If they did punch
  // that day, case 1 already covered it.)
  if (input.userCreatedOn >= input.date) return null;
  if (!computed) return null;

  return { kind: 'create', summary: computed };
}
