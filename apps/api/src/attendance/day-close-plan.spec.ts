import { AttendanceStatus, PunchType } from '@prisma/client';
import { planDayClose, type DayCloseInput } from './day-close-plan';
import type { RuleSnapshot } from './day-summary';

/**
 * The end-of-day decisions, without a database. Wednesday 14 Oct 2026, Lagos.
 */
const DATE = '2026-10-14'; // Wednesday
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 14, h - 1, m));
};

const RULE: RuleSnapshot = {
  id: 'rule-1',
  workingDays: [1, 2, 3, 4, 5],
  startMinutes: 480,
  endMinutes: 1020,
  gracePeriodMinutes: 10,
  overtimeAfterMinutes: 480,
};

const input = (o: Partial<DayCloseInput>): DayCloseInput => ({
  date: DATE,
  timeZone: 'Africa/Lagos',
  rule: RULE,
  isHoliday: false,
  userCreatedOn: '2026-09-01',
  punches: [],
  existing: null,
  ...o,
});

describe('a day nobody punched', () => {
  it('is ABSENT on a working day', () => {
    const plan = planDayClose(input({}));
    expect(plan).toMatchObject({
      kind: 'create',
      summary: { status: AttendanceStatus.ABSENT },
    });
  });

  it('is ON_HOLIDAY on a holiday — never absent', () => {
    expect(planDayClose(input({ isHoliday: true }))).toMatchObject({
      summary: { status: AttendanceStatus.ON_HOLIDAY },
    });
  });

  it('is REST_DAY when the rule does not work that day', () => {
    expect(
      planDayClose(input({ rule: { ...RULE, workingDays: [1] } })),
    ).toMatchObject({
      summary: { status: AttendanceStatus.REST_DAY },
    });
  });

  it('writes nothing when no rule exists — nobody is absent from hours never set', () => {
    expect(planDayClose(input({ rule: null }))).toBeNull();
  });

  it('writes nothing for someone whose account did not exist yet', () => {
    expect(planDayClose(input({ userCreatedOn: '2026-10-20' }))).toBeNull();
  });

  it('writes nothing for someone created that same day — invited at 14:00 is not absent', () => {
    expect(planDayClose(input({ userCreatedOn: DATE }))).toBeNull();
  });
});

describe('a day someone punched', () => {
  const PRESENT = { status: AttendanceStatus.PRESENT, isIncomplete: false };

  it('flags a day left clocked in — and creates no punch', () => {
    const plan = planDayClose(
      input({
        punches: [{ type: PunchType.CLOCK_IN, occurredAt: at('08:00') }],
        existing: PRESENT,
      }),
    );
    expect(plan).toEqual({ kind: 'update', data: { isIncomplete: true } });
  });

  it('flags a day left on a break', () => {
    const plan = planDayClose(
      input({
        punches: [
          { type: PunchType.CLOCK_IN, occurredAt: at('08:00') },
          { type: PunchType.BREAK_START, occurredAt: at('12:00') },
        ],
        existing: PRESENT,
      }),
    );
    expect(plan).toEqual({ kind: 'update', data: { isIncomplete: true } });
  });

  it('leaves a finished day alone', () => {
    const plan = planDayClose(
      input({
        punches: [
          { type: PunchType.CLOCK_IN, occurredAt: at('08:00') },
          { type: PunchType.CLOCK_OUT, occurredAt: at('17:00') },
        ],
        existing: PRESENT,
      }),
    );
    expect(plan).toBeNull();
  });

  it('touches ONLY the incomplete flag — never lateness or totals', () => {
    // Today's rule may differ from the one the day was judged against; the
    // snapshot on the row is the record, and the job must not rewrite it.
    const plan = planDayClose(
      input({
        rule: { ...RULE, startMinutes: 0 }, // a rule changed since
        punches: [{ type: PunchType.CLOCK_IN, occurredAt: at('08:00') }],
        existing: PRESENT,
      }),
    );
    expect(plan?.kind).toBe('update');
    expect(Object.keys((plan as { data: object }).data)).toEqual([
      'isIncomplete',
    ]);
  });

  it('is idempotent: already flagged means nothing to do', () => {
    const plan = planDayClose(
      input({
        punches: [{ type: PunchType.CLOCK_IN, occurredAt: at('08:00') }],
        existing: { status: AttendanceStatus.PRESENT, isIncomplete: true },
      }),
    );
    expect(plan).toBeNull();
  });

  it('counts the day even for someone created that day — they did turn up', () => {
    const plan = planDayClose(
      input({
        userCreatedOn: DATE,
        punches: [{ type: PunchType.CLOCK_IN, occurredAt: at('14:00') }],
        existing: PRESENT,
      }),
    );
    expect(plan).toEqual({ kind: 'update', data: { isIncomplete: true } });
  });
});

describe('re-running over days already closed', () => {
  it('turns ABSENT into ON_HOLIDAY when the holiday is entered the next morning', () => {
    const plan = planDayClose(
      input({
        isHoliday: true,
        existing: { status: AttendanceStatus.ABSENT, isIncomplete: false },
      }),
    );
    expect(plan).toEqual({
      kind: 'update',
      data: { status: AttendanceStatus.ON_HOLIDAY },
    });
  });

  it('changes nothing when the status still holds', () => {
    const plan = planDayClose(
      input({
        existing: { status: AttendanceStatus.ABSENT, isIncomplete: false },
      }),
    );
    expect(plan).toBeNull();
  });
});
