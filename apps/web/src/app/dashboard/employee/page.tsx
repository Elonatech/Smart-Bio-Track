"use client";

import {
  CalendarDays,
  CalendarOff,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  Clock4,
  PartyPopper,
  RefreshCw,
  Timer,
  TriangleAlert,
} from "lucide-react";
import { TodayStatusCard } from "@/app/components/dashboard/TodayStatusCard";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import {
  formatMinutes,
  formatWorkDate,
} from "@/app/components/dashboard/MyAttendanceHistory";
import { formatRecordedTime } from "@/app/components/dashboard/clockInOutcome";
import { extractErrorMessage } from "@/lib/api-client";
import { useAttendanceHistory } from "@/lib/attendanceQueries";
import {
  kindOf,
  type AttendanceDay,
  type AttendanceHistory,
  type DayKind,
} from "@/lib/attendance";
import { formatOrgToday, useOrgTimeZone, zoneLabel } from "@/lib/orgTime";
import { localToday } from "@/lib/orgToday";

// The employee's overview. Every figure is real since Phase 3: the status
// card reads GET /attendance/today, and the week bars, month calendar and
// recent activity all come from ONE GET /attendance/history call.
//
// A day the server has no record for is shown as "No record" — never
// guessed as present or absent. Dates are the organisation's calendar
// (history.timeZone), not the browser's.

// The server's day kinds, plus two the overview adds for cells with no row.
type CellStatus = DayKind | "NO_RECORD" | "FUTURE";

// One place defining how each status looks and reads, used by the bars,
// the calendar, its legend and the recent-activity pills.
const STATUS_META: Record<
  CellStatus,
  { label: string; cell: string; pill: string; icon: typeof CircleCheck }
> = {
  ON_TIME: {
    label: "On time",
    cell: "bg-success text-white",
    pill: "bg-success/10 text-success border-success/30",
    icon: CircleCheck,
  },
  LATE: {
    label: "Late",
    cell: "bg-warning text-white",
    pill: "bg-warning/10 text-warning border-warning/30",
    icon: Clock4,
  },
  IN_PROGRESS: {
    label: "In progress",
    cell: "bg-primary text-white",
    pill: "bg-primary/10 text-primary border-primary/30",
    icon: Timer,
  },
  INCOMPLETE: {
    label: "No clock-out",
    cell: "bg-alert/10 border-2 border-alert text-alert",
    pill: "bg-alert/10 text-alert border-alert/30",
    icon: TriangleAlert,
  },
  ABSENT: {
    label: "Absent",
    cell: "bg-alert text-white",
    pill: "bg-alert/10 text-alert border-alert/30",
    icon: CircleX,
  },
  HOLIDAY: {
    label: "Holiday",
    cell: "bg-info text-white",
    pill: "bg-info/10 text-info border-info/30",
    icon: PartyPopper,
  },
  REST_DAY: {
    label: "Rest day",
    cell: "bg-neutral/20 text-neutral",
    pill: "bg-neutral/10 text-neutral border-neutral/30",
    icon: CalendarOff,
  },
  NO_RECORD: {
    label: "No record",
    cell: "bg-neutral/10 text-neutral/60",
    pill: "bg-neutral/10 text-neutral border-neutral/30",
    icon: CircleDashed,
  },
  FUTURE: {
    label: "Upcoming",
    cell: "bg-transparent border border-dashed border-neutral/25 text-neutral/50",
    pill: "bg-neutral/10 text-neutral border-neutral/30",
    icon: CalendarDays,
  },
};

const LEGEND: CellStatus[] = ["ON_TIME", "LATE", "INCOMPLETE", "ABSENT", "HOLIDAY"];

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// How many of the latest recorded days "Recent activity" lists.
const RECENT_COUNT = 4;

// Far enough back to cover the whole of this month and this week (a week can
// start in the previous month) — one request, well inside the server's
// 93-day cap. The browser's date is fine here: a day either side doesn't
// matter for a window this wide.
const HISTORY_DAYS_BACK = 40;

function historyStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - HISTORY_DAYS_BACK);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Calendar arithmetic on "YYYY-MM-DD" strings, done in UTC so no time zone
// can shift a date by a day.
function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}
function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Monday = 0 … Sunday = 6. */
function weekdayIndex(date: string): number {
  return (toUtc(date).getUTCDay() + 6) % 7;
}

function statusOf(date: string, today: string, byDate: Map<string, AttendanceDay>): CellStatus {
  if (date > today) return "FUTURE";
  const day = byDate.get(date);
  return day ? kindOf(day) : "NO_RECORD";
}

export default function EmployeeDashboardPage() {
  // The organisation's date and zone, not the browser's (decision 1.1).
  const timeZone = useOrgTimeZone();
  const formattedToday = formatOrgToday(timeZone, new Date());

  // Title stays "Today" to match the reference — the navbar's account
  // chip already shows who is signed in.
  usePageHeader("Today", `${formattedToday}${timeZone ? ` · ${zoneLabel(timeZone)}` : ""}`);

  // Cached and shared with the status card's refresh (lib/attendanceQueries.ts):
  // a punch re-reads this too, so the charts update without a page refresh.
  const historyQuery = useAttendanceHistory(historyStart());
  const history = historyQuery.data ?? null;
  const loadError = historyQuery.error ? extractErrorMessage(historyQuery.error) : null;
  const load = () => void historyQuery.refetch();

  return (
    <div>
      {/* Today's status, plus its own clock-in/out/working-hours readouts. */}
      <TodayStatusCard />

      {loadError && !history ? (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-neutral/20 p-5 rounded-xl mt-6">
          <div className="min-w-0">
            <p className="text-sm font-medium text-heading">
              Couldn&apos;t load your attendance
            </p>
            <p className="text-xs text-neutral mt-0.5 wrap-break-word">{loadError}</p>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 border border-neutral/30 text-heading text-sm font-medium px-4 py-2 rounded-md hover:bg-neutral/10"
          >
            <RefreshCw className="h-4 w-4" strokeWidth={2} />
            Try again
          </button>
        </div>
      ) : (
        <Charts history={history} />
      )}
    </div>
  );
}

function Charts({ history }: { history: AttendanceHistory | null }) {
  if (!history) {
    return (
      <p className="mt-6 text-sm text-neutral" role="status">
        Loading your attendance…
      </p>
    );
  }

  const { timeZone, days: recorded } = history;
  const today = localToday(new Date(), timeZone).date;
  const byDate = new Map(recorded.map((day) => [day.workDate, day]));

  // This week, Monday to Sunday.
  const monday = addDays(today, -weekdayIndex(today));
  const week = WEEKDAY_LABELS.map((label, index) => {
    const date = addDays(monday, index);
    return {
      label,
      date,
      status: statusOf(date, today, byDate),
      minutes: byDate.get(date)?.workedMinutes ?? 0,
    };
  });
  // Bar heights are relative to the longest day of the week, so the chart
  // stays readable whatever the actual hours are.
  const maxMinutes = Math.max(...week.map((d) => d.minutes), 60);

  // This month, as a Monday-first grid.
  const monthStart = `${today.slice(0, 7)}-01`;
  const leadingBlanks = weekdayIndex(monthStart);
  const monthDays: { date: string; status: CellStatus }[] = [];
  for (let date = monthStart; date.slice(0, 7) === today.slice(0, 7); date = addDays(date, 1)) {
    monthDays.push({ date, status: statusOf(date, today, byDate) });
  }
  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(toUtc(monthStart));

  // Newest first already; rest days aren't "activity".
  const recent = recorded.filter((day) => day.status !== "REST_DAY").slice(0, RECENT_COUNT);

  return (
    <>
      {/* Row 2 — this week's bars + this month's calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-surface border border-neutral/20 p-5 rounded-xl">
          <h6 className="text-[15px] font-semibold text-heading">This week</h6>
          <p className="text-[12px] text-neutral">Hours worked per day</p>

          <div className="mt-6 flex items-end justify-between gap-2 sm:gap-3 h-44">
            {week.map((entry) => {
              const meta = STATUS_META[entry.status];
              // Floor at 6% so a zero-hour day still shows a visible stub
              // instead of collapsing to nothing.
              const heightPct = Math.max((entry.minutes / maxMinutes) * 100, 6);
              return (
                <div
                  key={entry.date}
                  className="flex-1 flex flex-col items-center justify-end h-full gap-2"
                >
                  <span className="text-[11px] font-medium text-neutral tabular-nums">
                    {entry.minutes > 0 ? `${(entry.minutes / 60).toFixed(1)}h` : "—"}
                  </span>
                  <div
                    style={{ height: `${heightPct}%` }}
                    title={`${formatWorkDate(entry.date)} · ${meta.label}`}
                    data-status={entry.status}
                    className={`w-full rounded-lg transition-all ${meta.cell}`}
                  />
                  <span className="text-[12px] text-neutral">{entry.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-surface border border-neutral/20 p-5 rounded-xl">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <h6 className="text-[15px] font-semibold text-heading">This month</h6>
              <p className="text-[12px] text-neutral">Colour-coded by attendance status</p>
            </div>
            <span className="text-[12px] font-medium text-neutral shrink-0">{monthLabel}</span>
          </div>

          <div className="mt-5 grid grid-cols-7 gap-1.5">
            {WEEKDAY_LABELS.map((label) => (
              <span
                key={label}
                className="text-center text-[10px] font-medium tracking-wide uppercase text-neutral pb-1"
              >
                {label.charAt(0)}
              </span>
            ))}

            {/* Empty cells so day 1 lands under its real weekday. */}
            {Array.from({ length: leadingBlanks }).map((_, index) => (
              <div key={`blank-${index}`} />
            ))}

            {monthDays.map((day) => {
              const meta = STATUS_META[day.status];
              return (
                <div
                  key={day.date}
                  title={`${formatWorkDate(day.date)} · ${meta.label}`}
                  data-status={day.status}
                  className={`aspect-square rounded-md flex items-center justify-center text-[11px] font-medium ${
                    meta.cell
                  } ${day.date === today ? "ring-2 ring-heading ring-offset-1 ring-offset-surface" : ""}`}
                >
                  {Number(day.date.slice(8))}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2 mt-5">
            {LEGEND.map((status) => {
              const meta = STATUS_META[status];
              const LegendIcon = meta.icon;
              return (
                <span
                  key={status}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium ${meta.pill}`}
                >
                  <LegendIcon className="h-3 w-3" strokeWidth={2} />
                  {meta.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 3 — recent activity */}
      <div className="bg-surface border border-neutral/20 p-5 rounded-xl mt-6">
        <h6 className="text-[15px] font-semibold text-heading">Recent activity</h6>
        <p className="text-[12px] text-neutral">Your last few attendance records</p>

        {recent.length === 0 ? (
          <p className="mt-5 text-sm text-neutral">
            Nothing recorded yet. Your days will appear here once you clock in.
          </p>
        ) : (
          <div className="mt-5 divide-y divide-neutral/10">
            {recent.map((day) => {
              const meta = STATUS_META[kindOf(day)];
              const RowIcon = meta.icon;
              return (
                <div
                  key={day.workDate}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                >
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 min-w-0">
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-heading whitespace-nowrap">
                      <CalendarDays className="h-4 w-4 text-neutral" strokeWidth={1.75} />
                      {formatWorkDate(day.workDate)}
                    </span>
                    <span className="inline-flex items-center gap-2 text-sm text-neutral whitespace-nowrap">
                      <Clock className="h-4 w-4" strokeWidth={1.75} />
                      {day.firstClockIn
                        ? `${formatRecordedTime(day.firstClockIn, timeZone)} – ${
                            day.lastClockOut ? formatRecordedTime(day.lastClockOut, timeZone) : "…"
                          }`
                        : "— — —"}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm text-neutral tabular-nums">
                      {formatMinutes(day.workedMinutes)}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium ${meta.pill}`}
                    >
                      <RowIcon className="h-3 w-3" strokeWidth={2} />
                      {meta.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
