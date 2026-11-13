"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { appClient, extractErrorMessage } from "@/lib/api-client";
import { fetchOrganization } from "@/lib/organization";
import { fetchWorkRules, type WorkRule } from "@/lib/workRules";
import { fetchHolidays } from "@/lib/holidays";
import {
  fetchOrgToday,
  localToday,
  type OrgTodayLate,
  type OrgTodayPerson,
} from "@/lib/orgToday";
import { formatRecordedTime } from "@/app/components/dashboard/clockInOutcome";
import { useAuthStore } from "@/lib/store/auth-store";

// "Today across the organisation" — replaces the clock-in card on the admin
// overview (Super Admins don't clock in). Industry-standard shape: who's in
// out of who's expected, then the people who need attention.
//
// The numbers are SAMPLE until the backend has an organisation-wide summary
// endpoint — see lib/orgToday.ts, whose fetchOrgToday() is the one function
// to swap. Everything around the numbers is real: the branches in the
// filter, and the holiday / rest day / no-rule states.

const REFRESH_MS = 2 * 60 * 1000;
const MIN_SPIN_MS = 500;
const PREVIEW_ROWS = 3;

interface Branch {
  id: string;
  name: string;
  workRuleId?: string | null;
}

interface Context {
  timeZone: string;
  workDate: string;
  weekday: number;
  branches: Branch[];
  rules: WorkRule[];
  holidayName: string | null;
}

/** Why there are no numbers to show today, or null if it's a normal day. */
function quietDay(ctx: Context, branchId: string | null): { title: string; body: string; link?: boolean } | null {
  if (ctx.holidayName) {
    return { title: `Today is ${ctx.holidayName}`, body: "It's a holiday, so nobody is expected in." };
  }
  // A branch with its own rule is judged by it; otherwise the default.
  const branch = branchId ? ctx.branches.find((b) => b.id === branchId) : null;
  const rule =
    (branch?.workRuleId && ctx.rules.find((r) => r.id === branch.workRuleId)) ||
    ctx.rules.find((r) => r.isDefault);
  if (!rule) {
    return {
      title: "No working hours set yet",
      body: "Set a default work rule to see who's late or not in.",
      link: true,
    };
  }
  if (!rule.workingDays.includes(ctx.weekday)) {
    return { title: "Not a working day", body: `Today isn't a working day under ${rule.name}.` };
  }
  return null;
}

async function loadContext(): Promise<Context> {
  const [org, rules, branches] = await Promise.all([
    fetchOrganization(),
    fetchWorkRules(),
    appClient.get<Branch[]>("/offices").then((res) => res.data),
  ]);
  const { date, weekday } = localToday(new Date(), org.timezone);
  const holidays = await fetchHolidays(Number(date.slice(0, 4)));
  return {
    timeZone: org.timezone,
    workDate: date,
    weekday,
    branches,
    rules,
    holidayName: holidays.find((h) => h.onDate === date)?.name ?? null,
  };
}

export function OrgTodayPanel() {
  const [branchId, setBranchId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAllLate, setShowAllLate] = useState(false);
  const [showAllNotIn, setShowAllNotIn] = useState(false);
  // Time Regulation is a Super Admin page; HR sees this panel too.
  const canEditRules = useAuthStore((state) => state.user?.role === "SUPER_ADMIN");
  // Part of every cache key, so one person's answers never reach another.
  const userId = useAuthStore((state) => state.user?.id) ?? "signed-out";

  // Both reads are cached (lib/queryClient.ts): returning to the overview
  // shows the last numbers at once while they re-read.

  // The slow-changing context: zone, rules, branches, today's holiday.
  const contextQuery = useQuery({
    queryKey: ["orgToday", userId, "context"],
    queryFn: loadContext,
  });
  const ctx = contextQuery.data ?? null;

  // The numbers, per branch. Kept fresh while the page is open — a
  // dashboard left up all morning shouldn't show 08:00's numbers at 11:00.
  const summaryQuery = useQuery({
    queryKey: ["orgToday", userId, "summary", ctx?.workDate, branchId],
    queryFn: () =>
      fetchOrgToday({ officeId: branchId, branches: ctx!.branches, workDate: ctx!.workDate }),
    enabled: ctx !== null,
    refetchInterval: REFRESH_MS,
    // Switching branch keeps the old numbers up until the new ones land.
    placeholderData: keepPreviousData,
  });
  const summary = summaryQuery.data ?? null;
  const updatedAt = summaryQuery.dataUpdatedAt ? new Date(summaryQuery.dataUpdatedAt) : null;

  const queryError = contextQuery.error ?? summaryQuery.error;
  const error = queryError ? extractErrorMessage(queryError) : null;

  // The spinner is for a refresh someone asked for, not the timed one. It
  // turns for at least MIN_SPIN_MS: the sample numbers come back in about a
  // millisecond, too fast to paint, so a press looked like it did nothing.
  function refresh() {
    setIsRefreshing(true);
    const minimumSpin = new Promise((resolve) => setTimeout(resolve, MIN_SPIN_MS));
    void Promise.allSettled([summaryQuery.refetch(), minimumSpin]).then(() =>
      setIsRefreshing(false)
    );
  }
  function retry() {
    void (ctx ? summaryQuery.refetch() : contextQuery.refetch());
  }

  const quiet = ctx ? quietDay(ctx, branchId) : null;
  const counts = summary?.counts;
  const percentIn = counts && counts.expected > 0 ? Math.round((counts.present / counts.expected) * 100) : 0;

  return (
    <div>
      <section
        aria-labelledby="org-today-title"
        className="bg-surface border border-neutral/20 rounded-xl p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="org-today-title" className="text-[15px] font-semibold text-heading">
              Today across the organisation
              {/* A badge, not a full banner: the overview pages already
                  carry a page-level sample notice, and two would be noise.
                  Disappears by itself once fetchOrgToday returns real data. */}
              {summary?.isSample && (
                <span className="ml-2 inline-block align-middle rounded bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning">
                  Sample data
                </span>
              )}
            </h2>
            <p className="text-xs text-neutral">
              {ctx ? formatDay(ctx.workDate) : "Loading…"}
              {updatedAt && ` · updated ${formatRecordedTime(updatedAt.toISOString(), ctx?.timeZone)}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Only worth showing with a choice to make. */}
            {ctx && ctx.branches.length > 1 && (
              <label className="flex items-center gap-2 text-xs text-neutral">
                <span className="sr-only sm:not-sr-only">Branch</span>
                <select
                  value={branchId ?? ""}
                  onChange={(event) => {
                    setBranchId(event.target.value || null);
                    setShowAllLate(false);
                    setShowAllNotIn(false);
                  }}
                  aria-label="Branch"
                  className="rounded-md border border-neutral/40 px-2 py-1.5 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">All branches</option>
                  {ctx.branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={refresh}
              disabled={!ctx || isRefreshing}
              aria-label="Refresh"
              className="rounded-md p-2 text-neutral hover:bg-neutral/10 hover:text-heading disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} strokeWidth={2} />
            </button>
          </div>
        </div>

        {error && !summary ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-alert/30 bg-alert/10 px-4 py-3">
            <p className="min-w-0 text-sm text-alert wrap-break-word">
              Couldn&apos;t load today&apos;s attendance: {error}
            </p>
            <button
              type="button"
              onClick={retry}
              className="text-sm font-medium text-heading hover:underline"
            >
              Try again
            </button>
          </div>
        ) : quiet ? (
          <div className="mt-4 rounded-md bg-neutral/5 px-4 py-6 text-center">
            <p className="text-sm font-medium text-heading">{quiet.title}</p>
            <p className="mt-1 text-sm text-neutral">
              {quiet.body}{" "}
              {quiet.link && canEditRules && (
                <Link href="/dashboard/super-admin/time-regulation" className="text-primary hover:underline">
                  Go to Time Regulation
                </Link>
              )}
            </p>
          </div>
        ) : !counts ? (
          <p className="mt-4 text-sm text-neutral">Loading today&apos;s attendance…</p>
        ) : (
          <>
            <div className="mt-4 flex justify-between text-sm">
              <span className="text-heading">
                {counts.present} of {counts.expected} expected are in
              </span>
              <span className="text-neutral tabular-nums">{percentIn}%</span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={percentIn}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Share of expected staff who are in"
              className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral/10"
            >
              <div className="h-full rounded-full bg-success" style={{ width: `${percentIn}%` }} />
            </div>

            <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tile label="Present" value={counts.present} sub={`${counts.clockedOut} clocked out`} />
              <Tile label="Late" value={counts.late} tone="warning" sub={averageLate(summary.late)} />
              <Tile label="On break" value={counts.onBreak} />
              <Tile
                label="Not in yet"
                value={counts.notInYet}
                tone={counts.notInYet > 0 ? "alert" : undefined}
                sub={counts.notInYet > 0 ? "Needs attention" : "Everyone's in"}
              />
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              <PeopleList
                title="Late arrivals"
                empty="Nobody's late today."
                people={summary.late}
                showAll={showAllLate}
                onToggle={() => setShowAllLate((v) => !v)}
                renderRight={(p) => (
                  <span className="text-warning tabular-nums whitespace-nowrap">
                    {formatRecordedTime((p as OrgTodayLate).firstClockIn, ctx?.timeZone)} · {(p as OrgTodayLate).lateMinutes}m
                  </span>
                )}
              />
              <PeopleList
                title="Not in yet"
                empty="Everyone expected is in."
                people={summary.notInYet}
                showAll={showAllNotIn}
                onToggle={() => setShowAllNotIn((v) => !v)}
                renderRight={(p) => <span className="text-neutral whitespace-nowrap">{p.branch}</span>}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function formatDay(workDate: string): string {
  // A calendar date in the org's zone, formatted as UTC so it can't shift.
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${workDate}T00:00:00Z`));
}

function averageLate(late: OrgTodayLate[]): string | undefined {
  if (late.length === 0) return undefined;
  const avg = Math.round(late.reduce((sum, p) => sum + p.lateMinutes, 0) / late.length);
  return `Avg ${avg} min`;
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "warning" | "alert";
}) {
  const labelClass = tone === "warning" ? "text-warning" : tone === "alert" ? "text-alert" : "text-neutral";
  return (
    <div
      className={`rounded-lg bg-neutral/5 p-3 ${tone === "alert" ? "ring-1 ring-alert/40" : ""}`}
    >
      <p className={`text-xs font-medium ${labelClass}`}>{label}</p>
      <p className="mt-0.5 text-2xl font-semibold text-heading tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-neutral">{sub}</p>}
    </div>
  );
}

function PeopleList({
  title,
  empty,
  people,
  showAll,
  onToggle,
  renderRight,
}: {
  title: string;
  empty: string;
  people: OrgTodayPerson[];
  showAll: boolean;
  onToggle: () => void;
  renderRight: (person: OrgTodayPerson) => React.ReactNode;
}) {
  // "See all" expands in place for now; it becomes a link to Reports when
  // that page exists (Phase 5).
  const visible = showAll ? people : people.slice(0, PREVIEW_ROWS);
  return (
    <div className="min-w-0">
      <h3 className="mb-1.5 text-sm font-medium text-heading">{title}</h3>
      {people.length === 0 ? (
        <p className="text-sm text-neutral">{empty}</p>
      ) : (
        <>
          <ul className="divide-y divide-neutral/10 border-y border-neutral/10 text-sm">
            {visible.map((person) => (
              <li key={person.userId} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-heading">
                  {person.name} <span className="text-neutral">· {person.department}</span>
                </span>
                {renderRight(person)}
              </li>
            ))}
          </ul>
          {people.length > PREVIEW_ROWS && (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={showAll}
              className="mt-1.5 text-sm font-medium text-primary hover:underline"
            >
              {showAll ? "Show fewer" : `See all ${people.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
