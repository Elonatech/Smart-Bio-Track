// "Today across the organisation" — the admin overview's live attendance.
//
// SAMPLE DATA FOR NOW. There is no organisation-wide attendance endpoint:
// every Phase 3 attendance route acts on the caller only, and HR views of
// other people are Phase 5 (Phase 3 Manual §1, §5.5). A spec for
// GET /attendance/today/summary (admins only, optional ?officeId=) has been
// sent to Enoch.
//
// fetchOrgToday() is the ONE function to swap when it lands — replace its
// body with the request, delete SAMPLE_PEOPLE and sampleSummary(), and the
// panel needs no change. Until then it returns `isSample: true`, which is
// what puts the "Sample data" banner on the panel.
//
// What IS real already: the branches the filter offers, and the panel's
// holiday / rest-day / no-rule states (from /holidays, /work-rules,
// /organization). Only the people and their numbers are invented.

export interface OrgTodayPerson {
  userId: string;
  name: string;
  department: string;
  branch: string;
}

export interface OrgTodayLate extends OrgTodayPerson {
  /** UTC ISO string. */
  firstClockIn: string;
  lateMinutes: number;
}

export interface OrgTodaySummary {
  counts: {
    /** Active staff whose rule makes today a working day (and not a holiday). */
    expected: number;
    /** Clocked in at least once today — includes those now on break or clocked out. */
    present: number;
    late: number;
    onBreak: number;
    clockedOut: number;
    notInYet: number;
  };
  late: OrgTodayLate[];
  notInYet: OrgTodayPerson[];
  /** True until the real endpoint exists. */
  isSample: boolean;
}

interface Branch {
  id: string;
  name: string;
}

// Invented people. Spread across the organisation's REAL branches (passed
// in), so the branch filter visibly does something while this is sample.
const SAMPLE_PEOPLE: { name: string; department: string; state: "late" | "notIn" | "onBreak" | "out" | "in"; lateMinutes?: number; clockIn?: string }[] = [
  { name: "Bola Ade", department: "Sales", state: "late", lateMinutes: 17, clockIn: "08:27" },
  { name: "Chidi Eze", department: "Operations", state: "late", lateMinutes: 9, clockIn: "08:19" },
  { name: "Ngozi Umeh", department: "Finance", state: "late", lateMinutes: 22, clockIn: "08:32" },
  { name: "Sani Musa", department: "Field", state: "late", lateMinutes: 6, clockIn: "08:16" },
  { name: "Amaka Obi", department: "Finance", state: "notIn" },
  { name: "Tunde Bello", department: "Field", state: "notIn" },
  { name: "Ifeanyi Okoro", department: "Engineering", state: "notIn" },
  { name: "Halima Yusuf", department: "Sales", state: "notIn" },
  { name: "Kemi Adeyemi", department: "Operations", state: "notIn" },
  { name: "Emeka Nwosu", department: "Engineering", state: "onBreak" },
  { name: "Fatima Bala", department: "Sales", state: "onBreak" },
  { name: "Segun Ojo", department: "Operations", state: "out" },
  { name: "Grace Etim", department: "Finance", state: "out" },
  ...Array.from({ length: 21 }, (_, i) => ({
    name: `Staff member ${i + 1}`,
    department: ["Engineering", "Sales", "Operations", "Finance"][i % 4],
    state: "in" as const,
  })),
];

function sampleSummary(branches: Branch[], officeId: string | null, workDate: string): OrgTodaySummary {
  const names = branches.length > 0 ? branches.map((b) => b.name) : ["Head office"];
  const people = SAMPLE_PEOPLE.map((p, i) => ({ ...p, userId: `sample-${i}`, branch: names[i % names.length] }));
  const wanted = officeId ? branches.find((b) => b.id === officeId)?.name : null;
  const scoped = wanted ? people.filter((p) => p.branch === wanted) : people;

  const late = scoped.filter((p) => p.state === "late");
  const notIn = scoped.filter((p) => p.state === "notIn");
  const present = scoped.filter((p) => p.state !== "notIn");

  return {
    counts: {
      expected: scoped.length,
      present: present.length,
      late: late.length,
      onBreak: scoped.filter((p) => p.state === "onBreak").length,
      clockedOut: scoped.filter((p) => p.state === "out").length,
      notInYet: notIn.length,
    },
    late: late.map(({ userId, name, department, branch, lateMinutes, clockIn }) => ({
      userId,
      name,
      department,
      branch,
      lateMinutes: lateMinutes ?? 0,
      // Lagos is UTC+1; these sample times are Lagos wall-clock.
      firstClockIn: new Date(`${workDate}T${clockIn}:00+01:00`).toISOString(),
    })),
    notInYet: notIn.map(({ userId, name, department, branch }) => ({ userId, name, department, branch })),
    isSample: true,
  };
}

/**
 * Today's organisation-wide attendance, optionally for one branch.
 * Swap the body for the real request when the endpoint exists.
 */
export async function fetchOrgToday(options: {
  officeId: string | null;
  branches: Branch[];
  workDate: string;
}): Promise<OrgTodaySummary> {
  return sampleSummary(options.branches, options.officeId, options.workDate);
}

/** "YYYY-MM-DD" and ISO weekday (1 = Mon … 7 = Sun) for `now` in `timeZone`. */
export function localToday(now: Date, timeZone: string): { date: string; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekday };
}
