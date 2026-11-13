/**
 * Turning a UTC instant into "which local day, and what time of it".
 *
 * Every question attendance asks about a day — was this person late, which
 * summary does this punch belong to, is today a working day — is a question
 * about the ORGANISATION's calendar, not the server's. Render runs in UTC, so
 * `Date#setHours(0)` and friends answer for London, not Lagos: a 00:30 Lagos
 * clock-in would land on the previous day, and an 08:05 arrival would be judged
 * against 08:00 UTC — an hour out (Phase 3 decision 1).
 *
 * So nothing in this module uses a Date's local-time methods. Everything goes
 * through Intl with an explicit `timeZone`, which is built into Node and needs
 * no dependency.
 */

/** A calendar date with no time and no zone, e.g. "2026-10-14". */
export type LocalDate = string;

export interface LocalMoment {
  date: LocalDate;
  /** Minutes after local midnight, 0–1439. Seconds are truncated, not rounded. */
  minutes: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** True for any zone name Node's Intl recognises, e.g. "Africa/Lagos". */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The local date and minute-of-day of an instant, in `timeZone`.
 *
 * Seconds are truncated. That is what makes FR-006's example come out the way
 * the PRTS states it: a clock reading 08:13 is minute 493 whether it is
 * 08:13:00 or 08:13:59, so "start 08:00, grace 10, in at 08:13" is 3 minutes
 * late. Rounding would make 08:10:31 a minute late, which no employee looking
 * at a clock showing 08:10 would accept.
 */
export function localMoment(instant: Date, timeZone: string): LocalMoment {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/**
 * The value Prisma needs for a `@db.Date` column.
 *
 * Postgres DATE has no zone; Prisma sends the UTC calendar date of whatever
 * Date it is given. So the local date is expressed as UTC midnight of that
 * same calendar date — never as local midnight, which in Lagos is 23:00 the
 * previous day in UTC and would store yesterday.
 */
export function toDbDate(date: LocalDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** The inverse of toDbDate, for a value read back from a `@db.Date` column. */
export function fromDbDate(value: Date): LocalDate {
  return value.toISOString().slice(0, 10);
}

/** ISO weekday of a calendar date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: LocalDate): number {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** "08:00" → 480. Rejects anything that is not a real 24-hour time. */
export function parseClockTime(hhmm: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** 480 → "08:00". */
export function formatClockTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
