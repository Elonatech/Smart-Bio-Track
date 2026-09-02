"use client";

import { useMemo } from "react";
import {
  CalendarDays,
  Clock,
  Clock4,
  CircleCheck,
  CircleX,
  FileText,
  Info,
  LogIn,
  LogOut,
  Timer,
} from "lucide-react";
import { TodayStatusCard } from "@/app/components/dashboard/TodayStatusCard";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";

// The EMPLOYEE role's own dashboard root. Until this file existed,
// anyone logging in as an EMPLOYEE was redirected to /dashboard/employee
// by roleRoutes.ts and hit a 404 — the folder was empty.
//
// There is no attendance backend yet: prisma/schema.prisma has only
// Organization / Department / Office / User + the three token tables —
// no Attendance, Punch or Shift model, and no matching module in
// apps/api/src. So every figure below is example data, and Clock In is
// deliberately disabled rather than wired to something that would
// silently do nothing (same call as the Suspend button in
// EmployeeDetailModal.tsx).

type DayStatus = "PRESENT" | "LATE" | "ABSENT" | "ON_LEAVE" | "OFF" | "FUTURE";

// One place defining how each status looks and reads, used by the month
// calendar, its legend, and the recent-activity pills. Adding a status
// forces you to give it a label and colours here rather than letting it
// fall through as unstyled text somewhere.
const STATUS_META: Record<
  DayStatus,
  { label: string; cell: string; pill: string; icon: typeof CircleCheck }
> = {
  PRESENT: {
    label: "Present",
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
  ABSENT: {
    label: "Absent",
    cell: "bg-alert text-white",
    pill: "bg-alert/10 text-alert border-alert/30",
    icon: CircleX,
  },
  ON_LEAVE: {
    label: "On leave",
    cell: "bg-info text-white",
    pill: "bg-info/10 text-info border-info/30",
    icon: FileText,
  },
  OFF: {
    label: "Non-working day",
    cell: "bg-neutral/10 text-neutral",
    pill: "bg-neutral/10 text-neutral border-neutral/30",
    icon: CalendarDays,
  },
  FUTURE: {
    label: "Upcoming",
    cell: "bg-transparent border border-dashed border-neutral/25 text-neutral/50",
    pill: "bg-neutral/10 text-neutral border-neutral/30",
    icon: CalendarDays,
  },
};

// Example hours per weekday. `status` drives the bar colour so the week
// chart and the month calendar speak the same visual language.
const WEEK: { day: string; hours: number; status: DayStatus }[] = [
  { day: "Mon", hours: 8.5, status: "PRESENT" },
  { day: "Tue", hours: 7.9, status: "LATE" },
  { day: "Wed", hours: 8.2, status: "PRESENT" },
  { day: "Thu", hours: 0, status: "ON_LEAVE" },
  { day: "Fri", hours: 8.4, status: "PRESENT" },
  { day: "Sat", hours: 0, status: "OFF" },
  { day: "Sun", hours: 0, status: "OFF" },
];

// Only the exceptions are listed — every other past weekday falls back
// to PRESENT, weekends to OFF, and anything after today to FUTURE (see
// buildMonthDays). Keeps the seed short and makes the odd days obvious.
const MONTH_EXCEPTIONS: Record<number, DayStatus> = {
  4: "ON_LEAVE",
  5: "LATE",
  8: "ABSENT",
  19: "ABSENT",
  23: "LATE",
  30: "ABSENT",
};

const RECENT: {
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  total: string;
  status: DayStatus;
}[] = [
  {
    date: "26 Aug 2026",
    clockIn: "08:03",
    clockOut: "17:12",
    total: "8h 27m",
    status: "PRESENT",
  },
  {
    date: "25 Aug 2026",
    clockIn: "08:41",
    clockOut: "17:30",
    total: "7h 54m",
    status: "LATE",
  },
  {
    date: "24 Aug 2026",
    clockIn: "07:56",
    clockOut: "17:05",
    total: "8h 31m",
    status: "PRESENT",
  },
  {
    date: "21 Aug 2026",
    clockIn: null,
    clockOut: null,
    total: "0h",
    status: "ON_LEAVE",
  },
];

interface MonthDay {
  dayOfMonth: number;
  status: DayStatus;
}

// Built from the real current month rather than a hardcoded 31-day grid,
// so the weekday alignment and the "which days are still upcoming" split
// stay correct as the date rolls over.
function buildMonthDays(today: Date): { leadingBlanks: number; days: MonthDay[] } {
  const year = today.getFullYear();
  const month = today.getMonth();

  // Day 0 of next month === last day of this one.
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // getDay() is Sunday-based (0 = Sun). We show Monday-first columns, so
  // shift it: Mon becomes 0, Sun becomes 6.
  const leadingBlanks = (new Date(year, month, 1).getDay() + 6) % 7;

  const days: MonthDay[] = [];
  for (let dayOfMonth = 1; dayOfMonth <= daysInMonth; dayOfMonth++) {
    const weekday = new Date(year, month, dayOfMonth).getDay();
    const isWeekend = weekday === 0 || weekday === 6;

    let status: DayStatus;
    if (dayOfMonth > today.getDate()) {
      status = "FUTURE";
    } else if (isWeekend) {
      status = "OFF";
    } else {
      status = MONTH_EXCEPTIONS[dayOfMonth] ?? "PRESENT";
    }

    days.push({ dayOfMonth, status });
  }

  return { leadingBlanks, days };
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function EmployeeDashboardPage() {
  const today = new Date();
  const formattedToday = today.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const monthLabel = today.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  // Title stays "Today" to match the reference — the navbar's account
  // chip already shows who is signed in.
  usePageHeader("Today", `${formattedToday} · West Africa Time (WAT)`);

  // Recomputed only when the calendar date actually changes, not on
  // every re-render.
  const { leadingBlanks, days } = useMemo(
    () => buildMonthDays(today),
    [today.toDateString()] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Bar heights are relative to the longest day of the week, so the
  // chart stays readable whatever the actual hours are.
  const maxHours = Math.max(...WEEK.map((d) => d.hours), 1);

  return (
    <div>
      {/* Row 1 — today's status (wide) + the three punch readouts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TodayStatusCard />
        </div>

        <div className="flex flex-col gap-4">
          <PunchCard
            icon={LogIn}
            label="Clock-in time"
            value="—"
            tone="text-primary bg-primary/10"
          />
          <PunchCard
            icon={LogOut}
            label="Clock-out time"
            value="—"
            tone="text-primary bg-primary/10"
          />
          <PunchCard
            icon={Timer}
            label="Working hours today"
            value="00:00"
            hint="Break 00:00"
            tone="text-success bg-success/15"
          />
        </div>
      </div>

      {/* One honest notice covering every figure on the page, rather than
          repeating a caveat inside each card. */}
      <div className="flex items-center gap-2 bg-primary/10 text-primary text-sm rounded-md px-4 py-2.5 mt-6">
        <Info className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        Example figures — your real attendance appears here once the attendance
        service is connected.
      </div>

      {/* Row 2 — this week's bars + this month's calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-surface border border-neutral/20 p-5 rounded-xl">
          <h6 className="text-[15px] font-semibold text-heading">This week</h6>
          <p className="text-[12px] text-neutral">Hours logged per day</p>

          <div className="mt-6 flex items-end justify-between gap-2 sm:gap-3 h-44">
            {WEEK.map((entry) => {
              const meta = STATUS_META[entry.status];
              // Floor at 6% so a zero-hour day still shows a visible
              // stub instead of collapsing to nothing.
              const heightPct = Math.max((entry.hours / maxHours) * 100, 6);
              return (
                <div
                  key={entry.day}
                  className="flex-1 flex flex-col items-center justify-end h-full gap-2"
                >
                  <span className="text-[11px] font-medium text-neutral tabular-nums">
                    {entry.hours > 0 ? `${entry.hours}h` : "—"}
                  </span>
                  <div
                    style={{ height: `${heightPct}%` }}
                    title={`${entry.day} · ${meta.label}`}
                    className={`w-full rounded-lg transition-all ${meta.cell}`}
                  />
                  <span className="text-[12px] text-neutral">{entry.day}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-surface border border-neutral/20 p-5 rounded-xl">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <h6 className="text-[15px] font-semibold text-heading">
                This month
              </h6>
              <p className="text-[12px] text-neutral">
                Colour-coded by attendance status
              </p>
            </div>
            <span className="text-[12px] font-medium text-neutral shrink-0">
              {monthLabel}
            </span>
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

            {days.map((day) => {
              const meta = STATUS_META[day.status];
              const isToday = day.dayOfMonth === today.getDate();
              return (
                <div
                  key={day.dayOfMonth}
                  title={`${day.dayOfMonth} ${monthLabel} · ${meta.label}`}
                  className={`aspect-square rounded-md flex items-center justify-center text-[11px] font-medium ${
                    meta.cell
                  } ${isToday ? "ring-2 ring-heading ring-offset-1 ring-offset-surface" : ""}`}
                >
                  {day.dayOfMonth}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2 mt-5">
            {(["PRESENT", "LATE", "ABSENT", "ON_LEAVE"] as const).map(
              (status) => {
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
              }
            )}
          </div>
        </div>
      </div>

      {/* Row 3 — recent activity */}
      <div className="bg-surface border border-neutral/20 p-5 rounded-xl mt-6">
        <h6 className="text-[15px] font-semibold text-heading">
          Recent activity
        </h6>
        <p className="text-[12px] text-neutral">
          Your last few attendance records
        </p>

        <div className="mt-5 divide-y divide-neutral/10">
          {RECENT.map((entry) => {
            const meta = STATUS_META[entry.status];
            const RowIcon = meta.icon;
            return (
              <div
                key={entry.date}
                className="flex flex-wrap items-center justify-between gap-3 py-3.5"
              >
                <div className="flex items-center gap-5 min-w-0">
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-heading whitespace-nowrap">
                    <CalendarDays
                      className="h-4 w-4 text-neutral"
                      strokeWidth={1.75}
                    />
                    {entry.date}
                  </span>
                  <span className="inline-flex items-center gap-2 text-sm text-neutral whitespace-nowrap">
                    <Clock className="h-4 w-4" strokeWidth={1.75} />
                    {entry.clockIn && entry.clockOut
                      ? `${entry.clockIn} – ${entry.clockOut}`
                      : "— — —"}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm text-neutral tabular-nums">
                    {entry.total}
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
      </div>
    </div>
  );
}

// The three small readouts stacked beside Today's status. Kept local to
// this file — nothing else needs this shape yet.
function PunchCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof LogIn;
  label: string;
  value: string;
  hint?: string;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-surface border border-neutral/20 p-4 rounded-xl">
      <div
        className={`flex items-center justify-center h-10 w-10 rounded-lg shrink-0 ${tone}`}
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-wide uppercase text-neutral">
          {label}
        </p>
        <p className="text-[20px] font-semibold text-heading leading-tight tabular-nums">
          {value}
        </p>
        {hint && <p className="text-[11px] text-neutral">{hint}</p>}
      </div>
    </div>
  );
}
