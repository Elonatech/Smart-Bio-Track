import { hoursBetween, overtimeExample, WORKING_DAYS_PER_MONTH } from './overtime';

describe('hoursBetween', () => {
  it('counts an ordinary working day', () => {
    expect(hoursBetween('08:00', '17:00')).toBe(9);
  });

  it('handles half hours', () => {
    expect(hoursBetween('08:30', '17:00')).toBe(8.5);
  });

  it('gives 0 for an end before the start — night shifts are not supported', () => {
    // Phase 3 Manual, decision 8. This used to read 20:00–06:00 as a
    // 10-hour night shift, which the API would then refuse.
    expect(hoursBetween('20:00', '06:00')).toBe(0);
  });

  it('treats identical times as zero rather than a full 24 hours', () => {
    expect(hoursBetween('09:00', '09:00')).toBe(0);
  });

  it.each([
    [undefined, '17:00'],
    ['08:00', undefined],
    ['', ''],
    ['8am', '5pm'],
    ['25:00', '17:00'],
    ['08:75', '17:00'],
  ])('returns 0 for unreadable input (%s, %s)', (start, end) => {
    expect(hoursBetween(start as string | undefined, end as string | undefined)).toBe(0);
  });
});

describe('overtimeExample', () => {
  // 9 h a day x 22 days = 198 h a month, so a 198,000 salary is exactly 1,000/h.
  const base = { monthlySalary: 198_000, dailyHours: 9, multiplier: 1.5, overtimeHours: 2 };

  it('converts a monthly salary to an hourly rate from the work rule', () => {
    const result = overtimeExample(base);
    expect(result?.monthlyHours).toBe(9 * WORKING_DAYS_PER_MONTH);
    expect(result?.hourlyRate).toBe(1000);
  });

  it('applies the multiplier to that hourly rate', () => {
    const result = overtimeExample(base);
    expect(result?.overtimeRate).toBe(1500);
    expect(result?.overtimePay).toBe(3000);
  });

  it('pays the normal rate at x1.0', () => {
    expect(overtimeExample({ ...base, multiplier: 1 })?.overtimeRate).toBe(1000);
  });

  it('scales with the number of overtime hours', () => {
    expect(overtimeExample({ ...base, overtimeHours: 4 })?.overtimePay).toBe(6000);
  });

  it.each([
    ['an empty salary (NaN, as from a cleared field)', { monthlySalary: NaN }],
    ['a zero salary', { monthlySalary: 0 }],
    ['a negative salary', { monthlySalary: -5 }],
    ['no daily hours', { dailyHours: 0 }],
    ['a zero multiplier', { multiplier: 0 }],
    ['negative overtime hours', { overtimeHours: -1 }],
  ])('returns null for %s', (_label, override) => {
    expect(overtimeExample({ ...base, ...override })).toBeNull();
  });
});
