import { Prisma, UserRole } from '@prisma/client';
import { fromDbDate, toDbDate, type LocalDate } from './attendance-time';

/**
 * What decides how a day is judged — shared by the punch path and the
 * end-of-day job, so both read a rule the same way and agree on what a
 * holiday is. There is exactly one copy of each of these on purpose: two
 * copies of "which rule applies" is how the punch and the day-close would
 * end up judging the same day differently.
 */

/** The WorkRule fields the summary arithmetic needs (see RuleSnapshot). */
export const RULE_SELECT = {
  id: true,
  workingDays: true,
  startMinutes: true,
  endMinutes: true,
  gracePeriodMinutes: true,
  overtimeBasis: true,
  overtimeAfterMinutes: true,
} satisfies Prisma.WorkRuleSelect;

/**
 * Whether `date` is a holiday for the organisation: an exact match, or an
 * annual holiday on the same month and day in any year. Annual ones are few
 * per organisation, so they are filtered here rather than with date
 * arithmetic in SQL.
 *
 * Takes any client, so it runs inside a punch's transaction or outside one.
 */
export async function isHolidayOn(
  client: Pick<Prisma.TransactionClient, 'holiday'>,
  organizationId: string,
  date: LocalDate,
): Promise<boolean> {
  const candidates = await client.holiday.findMany({
    where: {
      organizationId,
      OR: [{ date: toDbDate(date) }, { repeatsAnnually: true }],
    },
    select: { date: true, repeatsAnnually: true },
  });

  const monthDay = date.slice(5);
  return candidates.some((h) => {
    const d = fromDbDate(h.date);
    return d === date || (h.repeatsAnnually && d.slice(5) === monthDay);
  });
}

/** `date` moved by `days` calendar days. */
export function shiftDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Roles not tracked by attendance (Enoch, 27 Oct 2026: "i don't think it's
 * necessary to have super admin having attendance").
 *
 * Exempt means BOTH halves: the end-of-day job never marks them absent, and
 * the punch API refuses their punches. One without the other is worse than
 * either — an owner who clocked in once would show as present on that day and
 * have no record on any other, which reads as a broken report. HR Admins and
 * Team Leads are staff and stay tracked.
 */
export const ATTENDANCE_EXEMPT_ROLES: readonly UserRole[] = [
  UserRole.SUPER_ADMIN,
];
