// How overtime pay is worked out, shown as an EXAMPLE in the work-rules
// step so a client can see the rule do something. Nothing here is saved or
// used to pay anyone — there is no work-rule record or payroll calculation
// in the backend yet.
//
// The idea is the standard one: every pay basis is converted to an hourly
// rate, then overtime = hourly rate x multiplier x overtime hours.
//
//  - Paid hourly: the hourly rate is used as it is.
//  - Paid monthly: hourly rate = monthly salary / standard hours in a month.
//
// The standard hours come from the company's OWN work rule (daily hours x
// working days), which is what makes it a benchmark that works for any
// company instead of a number we picked for them.

/**
 * A five-day week is about 22 working days a month (52 weeks x 5 days / 12).
 * An assumption, not a company setting — the example says so on screen.
 */
export const WORKING_DAYS_PER_MONTH = 22;

function toMinutes(time: string | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time ?? "");
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Hours between two "HH:MM" times. An end at or before the start is 0: night
 * shifts aren't supported (Phase 3 Manual, decision 8 — the API refuses them),
 * so the worked example must not present 20:00–06:00 as a valid 10-hour day.
 * Anything unreadable is 0 too — never a made-up figure.
 */
export function hoursBetween(start: string | undefined, end: string | undefined): number {
  const from = toMinutes(start);
  const to = toMinutes(end);
  if (from === null || to === null) return 0;

  return Math.max(0, to - from) / 60;
}

export interface OvertimeExample {
  monthlyHours: number;
  hourlyRate: number;
  overtimeRate: number;
  overtimePay: number;
}

/** Null when the inputs can't produce a sensible figure, so the caller can hide the example. */
export function overtimeExample({
  monthlySalary,
  dailyHours,
  multiplier,
  overtimeHours,
}: {
  monthlySalary: number;
  dailyHours: number;
  multiplier: number;
  overtimeHours: number;
}): OvertimeExample | null {
  const values = [monthlySalary, dailyHours, multiplier, overtimeHours];
  if (!values.every(Number.isFinite)) return null;
  if (monthlySalary <= 0 || dailyHours <= 0 || multiplier <= 0 || overtimeHours < 0) return null;

  const monthlyHours = dailyHours * WORKING_DAYS_PER_MONTH;
  const hourlyRate = monthlySalary / monthlyHours;
  const overtimeRate = hourlyRate * multiplier;
  return { monthlyHours, hourlyRate, overtimeRate, overtimePay: overtimeRate * overtimeHours };
}
