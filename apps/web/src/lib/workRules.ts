import { appClient } from "@/lib/api-client";

// Work rules (Phase 3 M2, apps/api/src/work-rules): several per organisation,
// exactly one the default, optionally assigned to branches. Anyone signed in
// may read them; only Super Admin and HR Admin may change them.
//
// Shapes mirror work-rules.service.ts `present()` and CreateWorkRuleDto.
// Times are "HH:mm" both ways — the server converts to minutes internally.

/**
 * How a rule counts overtime (decided 27 Oct 2026, migration 19):
 * END_TIME — work after the rule's end time (the server's default);
 * DAILY_HOURS — worked time beyond overtimeAfterMinutes; NONE — not tracked.
 * Mirrors Prisma's OvertimeBasis; move to packages/types with the rest.
 */
export type OvertimeBasis = "END_TIME" | "DAILY_HOURS" | "NONE";

export interface WorkRule {
  id: string;
  name: string;
  isDefault: boolean;
  /** ISO weekdays: 1 = Monday … 7 = Sunday. */
  workingDays: number[];
  startTime: string;
  endTime: string;
  gracePeriodMinutes: number;
  overtimeBasis: OvertimeBasis;
  /** Only for DAILY_HOURS: worked minutes after which the rest is overtime. Otherwise null. */
  overtimeAfterMinutes: number | null;
  overtimeMultiplier: number;
  /** Branches that use this rule instead of the default. */
  offices: { id: string; name: string }[];
}

export interface WorkRuleInput {
  name: string;
  workingDays: number[];
  startTime: string;
  endTime: string;
  gracePeriodMinutes: number;
  // Always sent with the basis: a threshold sent alone still means the old
  // rules (null = NONE), which would silently turn overtime off.
  overtimeBasis: OvertimeBasis;
  /** A number only with DAILY_HOURS; null otherwise (the server refuses one). */
  overtimeAfterMinutes: number | null;
  overtimeMultiplier: number;
  isDefault?: boolean;
}

/** The three choices, in the order a person reads them. */
export const OVERTIME_BASES: { value: OvertimeBasis; label: string; hint: string }[] = [
  {
    value: "END_TIME",
    label: "After the end time",
    hint: "Work after the rule's end time is overtime, however late someone started.",
  },
  {
    value: "DAILY_HOURS",
    label: "After a number of hours worked",
    hint: "Worked time beyond the hours you set is overtime, whatever the clock says.",
  },
  { value: "NONE", label: "Don't track overtime", hint: "All worked time is normal time." },
];

export async function fetchWorkRules(): Promise<WorkRule[]> {
  const { data } = await appClient.get<WorkRule[]>("/work-rules");
  return data;
}

export async function createWorkRule(input: WorkRuleInput): Promise<WorkRule> {
  const { data } = await appClient.post<WorkRule>("/work-rules", input);
  return data;
}

export async function updateWorkRule(id: string, input: Partial<WorkRuleInput>): Promise<WorkRule> {
  const { data } = await appClient.patch<WorkRule>(`/work-rules/${id}`, input);
  return data;
}

export async function deleteWorkRule(id: string): Promise<void> {
  await appClient.delete(`/work-rules/${id}`);
}

/**
 * The agreed overtime rates — multipliers of the hourly rate. The API accepts
 * 1–5, but these four are the product's set (same as onboarding's
 * StepWorkRules).
 */
export const OVERTIME_RATES = [
  { value: 1, label: "Normal rate — ×1.0" },
  { value: 1.5, label: "Time and a half — ×1.5" },
  { value: 2, label: "Double time — ×2.0" },
  { value: 3, label: "Triple time — ×3.0" },
] as const;

export const WEEKDAYS = [
  { value: 1, short: "Mon" },
  { value: 2, short: "Tue" },
  { value: 3, short: "Wed" },
  { value: 4, short: "Thu" },
  { value: 5, short: "Fri" },
  { value: 6, short: "Sat" },
  { value: 7, short: "Sun" },
] as const;

/**
 * [1,2,3,4,5] → "Mon–Fri"; [1,3,5] → "Mon, Wed, Fri"; all seven → "Every day".
 * Runs of three or more consecutive days collapse into a range.
 */
export function formatWorkingDays(days: readonly number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return "Every day";
  if (sorted.length === 0) return "No days";

  const name = (d: number) => WEEKDAYS[d - 1].short;
  const parts: string[] = [];
  let runStart = sorted[0];
  let previous = sorted[0];

  const closeRun = () => {
    const length = previous - runStart + 1;
    if (length >= 3) parts.push(`${name(runStart)}–${name(previous)}`);
    else for (let d = runStart; d <= previous; d++) parts.push(name(d));
  };

  for (const day of sorted.slice(1)) {
    if (day === previous + 1) {
      previous = day;
      continue;
    }
    closeRun();
    runStart = previous = day;
  }
  closeRun();
  return parts.join(", ");
}

/** "08:00" → 480. */
export function clockToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** 480 → "8 h", 450 → "7.5 h". */
export function formatHours(minutes: number): string {
  return `${Number((minutes / 60).toFixed(2))} h`;
}
