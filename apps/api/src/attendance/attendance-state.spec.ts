import { PunchType } from '@prisma/client';
import {
  refusalFor,
  stateFromPunches,
  type AttendanceState,
} from './attendance-state';

/**
 * The punch state machine, without a database.
 *
 * The transition scenarios here are Emmanuel's, from his original
 * attendance.service.spec.ts (already clocked in, not clocked in, on a break,
 * not on a break), ported to the pure function that now decides them. His
 * version mocked Prisma, so it checked that a refusal was thrown but could not
 * see the rule itself; this one tests the rule directly, for every state.
 *
 * Changed deliberately (14 Oct 2026): several sessions a day are allowed, so
 * clocking in again after clocking out is accepted. The original refused it
 * with "wait until tomorrow".
 */
describe('stateFromPunches', () => {
  const p = (...types: PunchType[]) => types.map((type) => ({ type }));

  it.each<[string, PunchType[], AttendanceState]>([
    ['no punches', [], 'NOT_STARTED'],
    ['clocked in', ['CLOCK_IN'], 'CLOCKED_IN'],
    ['on a break', ['CLOCK_IN', 'BREAK_START'], 'ON_BREAK'],
    [
      'back from a break',
      ['CLOCK_IN', 'BREAK_START', 'BREAK_END'],
      'CLOCKED_IN',
    ],
    ['clocked out', ['CLOCK_IN', 'CLOCK_OUT'], 'CLOCKED_OUT'],
    ['second session', ['CLOCK_IN', 'CLOCK_OUT', 'CLOCK_IN'], 'CLOCKED_IN'],
  ])('%s → %s', (_label, types, expected) => {
    expect(stateFromPunches(p(...types))).toBe(expected);
  });
});

describe('refusalFor — what each state allows', () => {
  const ALLOWED: Record<AttendanceState, PunchType[]> = {
    NOT_STARTED: ['CLOCK_IN'],
    CLOCKED_IN: ['CLOCK_OUT', 'BREAK_START'],
    ON_BREAK: ['BREAK_END'],
    // The several-sessions decision: clocked out is not the end of the day.
    CLOCKED_OUT: ['CLOCK_IN'],
  };

  const ALL: PunchType[] = [
    'CLOCK_IN',
    'CLOCK_OUT',
    'BREAK_START',
    'BREAK_END',
  ];

  // Every (state, action) pair, so a transition nobody thought about cannot
  // slip through: 16 cases, each either allowed or refused with a message.
  for (const state of Object.keys(ALLOWED) as AttendanceState[]) {
    for (const action of ALL) {
      const allowed = ALLOWED[state].includes(action);
      it(`${state} + ${action} → ${allowed ? 'allowed' : 'refused'}`, () => {
        const refusal = refusalFor(state, action);
        if (allowed) {
          expect(refusal).toBeNull();
        } else {
          expect(refusal).toEqual(expect.any(String));
          expect(refusal!.length).toBeGreaterThan(0);
        }
      });
    }
  }

  it('tells someone on a break to end it, not that they are "not clocked in"', () => {
    // The clock-out message matters: the person IS clocked in. Saying
    // otherwise sends them looking for a problem that is not there.
    expect(refusalFor('ON_BREAK', PunchType.CLOCK_OUT)).toMatch(
      /end your break/i,
    );
  });
});
