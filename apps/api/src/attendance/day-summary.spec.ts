import { AttendanceStatus, PunchType } from '@prisma/client';
import {
  BREAKS_ARE_PAID,
  computeDaySummary,
  type DaySummaryInput,
  type PunchInput,
  type RuleSnapshot,
} from './day-summary';

/**
 * The daily summary arithmetic (FR-005, FR-006), as a table of cases.
 *
 * These exist because the first version of this logic was tested only through
 * a mocked database, which checked that a summary was written but never what
 * was in it. Two real faults survived that way: the summary was never created
 * (so the first punch of every day errored), and time worked before a break
 * was counted as break time. Both are pinned below by name.
 *
 * All times are Lagos (UTC+1) on Wednesday 14 Oct 2026.
 */
const DATE = '2026-10-14'; // a Wednesday
const TZ = 'Africa/Lagos';

/** "08:13" in Lagos on DATE, as the UTC instant the server would store. */
const at = (hhmm: string, seconds = 0): Date => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 14, h - 1, m, seconds));
};

const punches = (...pairs: [PunchType, string][]): PunchInput[] =>
  pairs.map(([type, hhmm]) => ({ type, occurredAt: at(hhmm) }));

const STANDARD: RuleSnapshot = {
  id: 'rule-1',
  workingDays: [1, 2, 3, 4, 5],
  startMinutes: 8 * 60,
  endMinutes: 17 * 60,
  gracePeriodMinutes: 10,
  overtimeAfterMinutes: 8 * 60,
};

const day = (overrides: Partial<DaySummaryInput>): DaySummaryInput => ({
  workDate: DATE,
  timeZone: TZ,
  punches: [],
  rule: STANDARD,
  isHoliday: false,
  dayClosed: false,
  ...overrides,
});

describe('FR-006 lateness', () => {
  it("matches the PRTS's own example: start 08:00, grace 10, in at 08:13 → 3 minutes late", () => {
    const s = computeDaySummary(
      day({ punches: punches(['CLOCK_IN', '08:13']) }),
    )!;
    expect(s.isLate).toBe(true);
    expect(s.lateMinutes).toBe(3); // from the END of grace — not 13
  });

  it.each([
    ['08:00', 0],
    ['08:10', 0], // last minute of grace is still on time
    ['08:11', 1],
    ['09:30', 80],
  ])('in at %s → %i minutes late', (time, expected) => {
    const s = computeDaySummary(day({ punches: punches(['CLOCK_IN', time]) }))!;
    expect(s.lateMinutes).toBe(expected);
    expect(s.isLate).toBe(expected > 0);
  });

  it('ignores seconds: 08:10:59 is on time', () => {
    const s = computeDaySummary(
      day({
        punches: [{ type: PunchType.CLOCK_IN, occurredAt: at('08:10', 59) }],
      }),
    )!;
    expect(s.lateMinutes).toBe(0);
  });

  it('judges only the FIRST clock-in — returning from an errand is not lateness', () => {
    const s = computeDaySummary(
      day({
        punches: punches(
          ['CLOCK_IN', '08:00'],
          ['CLOCK_OUT', '11:00'],
          ['CLOCK_IN', '14:00'],
        ),
      }),
    )!;
    expect(s.isLate).toBe(false);
  });

  // Emmanuel's original principle: no rule means no lateness, not a guess.
  it('is never late when the organisation has configured no rule', () => {
    const s = computeDaySummary(
      day({ rule: null, punches: punches(['CLOCK_IN', '11:00']) }),
    )!;
    expect(s.isLate).toBe(false);
    expect(s.status).toBe(AttendanceStatus.PRESENT);
    expect(s.workRuleId).toBeNull();
  });

  it('is never late on a holiday', () => {
    const s = computeDaySummary(
      day({ isHoliday: true, punches: punches(['CLOCK_IN', '11:00']) }),
    )!;
    expect(s.isLate).toBe(false);
  });

  it('is never late on a rest day', () => {
    const s = computeDaySummary(
      day({
        rule: { ...STANDARD, workingDays: [1, 2] },
        punches: punches(['CLOCK_IN', '11:00']),
      }),
    )!;
    expect(s.isLate).toBe(false);
    expect(s.status).toBe(AttendanceStatus.PRESENT); // working a rest day is still present
  });
});

describe('working and break time', () => {
  it('counts the time BEFORE a break as work (the original bug)', () => {
    // 08:00–12:00 work, 12:00–13:00 lunch, 13:00–17:00 work.
    // The version this replaced reported 4h break and 4h work.
    const s = computeDaySummary(
      day({
        punches: punches(
          ['CLOCK_IN', '08:00'],
          ['BREAK_START', '12:00'],
          ['BREAK_END', '13:00'],
          ['CLOCK_OUT', '17:00'],
        ),
      }),
    )!;
    expect(s.breakMinutes).toBe(60);
    expect(s.workedMinutes).toBe(8 * 60);
  });

  it('subtracts breaks from working time (decision 3, pending management)', () => {
    // Pinned so that flipping BREAKS_ARE_PAID is a visible, deliberate change.
    expect(BREAKS_ARE_PAID).toBe(false);
  });

  it('adds up several sessions in one day', () => {
    const s = computeDaySummary(
      day({
        punches: punches(
          ['CLOCK_IN', '08:00'],
          ['CLOCK_OUT', '10:00'],
          ['CLOCK_IN', '11:00'],
          ['CLOCK_OUT', '15:30'],
        ),
      }),
    )!;
    expect(s.workedMinutes).toBe(6 * 60 + 30);
    expect(s.firstClockIn).toEqual(at('08:00'));
    expect(s.lastClockOut).toEqual(at('15:30'));
  });

  it('adds up several breaks', () => {
    const s = computeDaySummary(
      day({
        punches: punches(
          ['CLOCK_IN', '08:00'],
          ['BREAK_START', '10:00'],
          ['BREAK_END', '10:15'],
          ['BREAK_START', '12:00'],
          ['BREAK_END', '12:45'],
          ['CLOCK_OUT', '17:00'],
        ),
      }),
    )!;
    expect(s.breakMinutes).toBe(60);
    expect(s.workedMinutes).toBe(9 * 60 - 60);
  });

  it('does not guess the length of a session still in progress', () => {
    const s = computeDaySummary(
      day({
        punches: punches(['CLOCK_IN', '08:00'], ['BREAK_START', '12:00']),
      }),
    )!;
    expect(s.workedMinutes).toBe(4 * 60); // closed by the break
    expect(s.breakMinutes).toBe(0); // break still running
    expect(s.lastClockOut).toBeNull();
  });

  it('floors part-minutes rather than rounding them up', () => {
    const s = computeDaySummary(
      day({
        punches: [
          { type: PunchType.CLOCK_IN, occurredAt: at('08:00', 0) },
          { type: PunchType.CLOCK_OUT, occurredAt: at('08:01', 59) },
        ],
      }),
    )!;
    expect(s.workedMinutes).toBe(1);
  });
});

describe('overtime', () => {
  it('counts minutes worked beyond the threshold', () => {
    const s = computeDaySummary(
      day({ punches: punches(['CLOCK_IN', '08:00'], ['CLOCK_OUT', '18:30']) }),
    )!;
    expect(s.overtimeMinutes).toBe(10 * 60 + 30 - 8 * 60);
  });

  it('is zero when the rule does not track overtime', () => {
    const s = computeDaySummary(
      day({
        rule: { ...STANDARD, overtimeAfterMinutes: null },
        punches: punches(['CLOCK_IN', '08:00'], ['CLOCK_OUT', '20:00']),
      }),
    )!;
    expect(s.overtimeMinutes).toBe(0);
  });

  it('is computed on worked time, so a long lunch does not count as overtime', () => {
    const s = computeDaySummary(
      day({
        punches: punches(
          ['CLOCK_IN', '08:00'],
          ['BREAK_START', '12:00'],
          ['BREAK_END', '14:00'],
          ['CLOCK_OUT', '18:00'],
        ),
      }),
    )!;
    expect(s.workedMinutes).toBe(8 * 60);
    expect(s.overtimeMinutes).toBe(0);
  });
});

describe('days with no punches (for the end-of-day job, M6)', () => {
  it('is ABSENT on a working day', () => {
    expect(computeDaySummary(day({ dayClosed: true }))!.status).toBe(
      AttendanceStatus.ABSENT,
    );
  });

  it('is ON_HOLIDAY on a holiday — never absent', () => {
    expect(
      computeDaySummary(day({ isHoliday: true, dayClosed: true }))!.status,
    ).toBe(AttendanceStatus.ON_HOLIDAY);
  });

  it('is REST_DAY on a day the rule does not work', () => {
    const s = computeDaySummary(
      day({ rule: { ...STANDARD, workingDays: [1] }, dayClosed: true }),
    )!;
    expect(s.status).toBe(AttendanceStatus.REST_DAY);
  });

  it('records nothing at all when no rule exists — nobody is absent from hours never set', () => {
    expect(computeDaySummary(day({ rule: null, dayClosed: true }))).toBeNull();
  });
});

describe('incomplete days (decision 4)', () => {
  it('flags a day closed with someone still clocked in — and invents no clock-out', () => {
    const s = computeDaySummary(
      day({ punches: punches(['CLOCK_IN', '08:00']), dayClosed: true }),
    )!;
    expect(s.isIncomplete).toBe(true);
    expect(s.lastClockOut).toBeNull();
    expect(s.workedMinutes).toBe(0);
  });

  it('does not flag someone still clocked in while the day is running', () => {
    const s = computeDaySummary(
      day({ punches: punches(['CLOCK_IN', '08:00']) }),
    )!;
    expect(s.isIncomplete).toBe(false);
  });
});

describe('rule snapshot', () => {
  it('records the rule it was judged against, so a later rule change cannot rewrite history', () => {
    const s = computeDaySummary(
      day({ punches: punches(['CLOCK_IN', '08:00']) }),
    )!;
    expect(s).toMatchObject({
      workRuleId: 'rule-1',
      scheduledStartMinutes: 480,
      scheduledEndMinutes: 1020,
      gracePeriodMinutes: 10,
    });
  });
});
