import {
  formatClockTime,
  fromDbDate,
  isValidTimeZone,
  isoWeekday,
  localMoment,
  parseClockTime,
  toDbDate,
} from './attendance-time';

/**
 * Phase 3 design problem #1: the server runs in UTC and the organisation does
 * not. Every case here is one where using the server's own clock gives a
 * different — wrong — answer.
 */
describe('localMoment', () => {
  it('puts a Lagos 00:30 clock-in on the Lagos day, not the UTC one', () => {
    // 23:30 UTC on the 13th is 00:30 on the 14th in Lagos (UTC+1).
    const instant = new Date('2026-10-13T23:30:00Z');
    expect(localMoment(instant, 'Africa/Lagos')).toEqual({
      date: '2026-10-14',
      minutes: 30,
    });
    expect(localMoment(instant, 'UTC')).toEqual({
      date: '2026-10-13',
      minutes: 1410,
    });
  });

  it('reads 08:05 Lagos as 08:05, not 07:05', () => {
    expect(
      localMoment(new Date('2026-10-14T07:05:00Z'), 'Africa/Lagos').minutes,
    ).toBe(485);
  });

  it('truncates seconds — 08:13:59 is still minute 493 (FR-006)', () => {
    expect(
      localMoment(new Date('2026-10-14T07:13:59Z'), 'Africa/Lagos').minutes,
    ).toBe(493);
  });

  it('handles a zone with daylight saving', () => {
    // London is UTC+1 in summer, UTC+0 in winter; the same UTC time reads
    // differently either side of the change.
    expect(
      localMoment(new Date('2026-07-01T07:00:00Z'), 'Europe/London').minutes,
    ).toBe(480);
    expect(
      localMoment(new Date('2026-12-01T07:00:00Z'), 'Europe/London').minutes,
    ).toBe(420);
  });

  it('never reports minute 1440 for midnight', () => {
    // hourCycle h23, not h24: midnight is 00:00, not 24:00.
    expect(
      localMoment(new Date('2026-10-13T23:00:00Z'), 'Africa/Lagos'),
    ).toEqual({
      date: '2026-10-14',
      minutes: 0,
    });
  });
});

describe('@db.Date round trip', () => {
  it('stores the local date as UTC midnight of that same calendar date', () => {
    // Not local midnight: in Lagos that is 23:00 the PREVIOUS day in UTC, and
    // Postgres would store yesterday.
    expect(toDbDate('2026-10-14').toISOString()).toBe(
      '2026-10-14T00:00:00.000Z',
    );
    expect(fromDbDate(toDbDate('2026-10-14'))).toBe('2026-10-14');
  });
});

describe('isoWeekday', () => {
  it.each([
    ['2026-10-12', 1], // Monday
    ['2026-10-16', 5], // Friday
    ['2026-10-18', 7], // Sunday — 7, not JavaScript's 0
  ])('%s → %i', (date, day) => {
    expect(isoWeekday(date)).toBe(day);
  });
});

describe('clock times', () => {
  it('parses and formats 24-hour times', () => {
    expect(parseClockTime('08:00')).toBe(480);
    expect(parseClockTime('23:59')).toBe(1439);
    expect(formatClockTime(480)).toBe('08:00');
  });

  it.each(['24:00', '8:00', '08:60', '0800', ''])('rejects %p', (value) => {
    expect(parseClockTime(value)).toBeNull();
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA names and rejects anything else', () => {
    expect(isValidTimeZone('Africa/Lagos')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
  });
});
