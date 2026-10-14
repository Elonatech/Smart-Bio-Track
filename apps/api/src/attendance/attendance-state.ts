import { PunchType } from '@prisma/client';

/**
 * Where someone is in their day, derived from that day's punches.
 *
 * Several sessions a day are allowed (decided 14 Oct 2026): clocking out and
 * back in — an errand, a site visit — is normal, and the PRTS summary speaks of
 * "first clock in" and "last clock out", which only means something if there
 * can be more than one. So CLOCKED_OUT is not a terminal state; it is the same
 * as NOT_STARTED except that the day already has history.
 *
 * Kept free of the database on purpose. The service decides this inside a
 * locked transaction, and every transition is unit-tested here without one.
 */
export type AttendanceState =
  | 'NOT_STARTED'
  | 'CLOCKED_IN'
  | 'ON_BREAK'
  | 'CLOCKED_OUT';

export function stateFromPunches(
  punches: readonly { type: PunchType }[],
): AttendanceState {
  const last = punches[punches.length - 1];
  if (!last) return 'NOT_STARTED';

  switch (last.type) {
    case PunchType.CLOCK_IN:
    case PunchType.BREAK_END:
      return 'CLOCKED_IN';
    case PunchType.BREAK_START:
      return 'ON_BREAK';
    case PunchType.CLOCK_OUT:
      return 'CLOCKED_OUT';
  }
}

/**
 * Whether `action` is allowed from `state`, and if not, what to tell the
 * person. Null means allowed.
 *
 * The messages are the user-facing explanation, so they say what to do next
 * rather than naming the rule that was broken.
 */
export function refusalFor(
  state: AttendanceState,
  action: PunchType,
): string | null {
  switch (action) {
    case PunchType.CLOCK_IN:
      if (state === 'CLOCKED_IN') return 'You are already clocked in.';
      if (state === 'ON_BREAK')
        return 'You are on a break. End your break instead of clocking in again.';
      return null;

    case PunchType.CLOCK_OUT:
      if (state === 'ON_BREAK')
        return 'You are on a break. End your break before clocking out.';
      if (state !== 'CLOCKED_IN') return 'You are not clocked in.';
      return null;

    case PunchType.BREAK_START:
      if (state === 'ON_BREAK') return 'You are already on a break.';
      if (state !== 'CLOCKED_IN') return 'Clock in before starting a break.';
      return null;

    case PunchType.BREAK_END:
      if (state !== 'ON_BREAK') return 'You are not on a break.';
      return null;
  }
}
