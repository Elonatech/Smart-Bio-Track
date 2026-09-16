// Shared by the notification panel — nothing else needs "N days ago"
// formatting yet, but the moment a second consumer does, it belongs here
// rather than reimplemented slightly differently twice.
const UNITS: { limit: number; divisor: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { limit: 60_000, divisor: 1_000, unit: "second" },
  { limit: 3_600_000, divisor: 60_000, unit: "minute" },
  { limit: 86_400_000, divisor: 3_600_000, unit: "hour" },
  { limit: 604_800_000, divisor: 86_400_000, unit: "day" },
  { limit: 2_629_800_000, divisor: 604_800_000, unit: "week" },
];

const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "2h ago", "4 days ago", "1 week ago" — always in the past, never a future tense. */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 30_000) {
    return "Just now";
  }

  for (const { limit, divisor, unit } of UNITS) {
    if (diffMs < limit) {
      return formatter.format(-Math.round(diffMs / divisor), unit);
    }
  }

  // Beyond a month, a relative label stops being useful ("2 months ago"
  // is vaguer than the actual date) — fall back to a short absolute one.
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
