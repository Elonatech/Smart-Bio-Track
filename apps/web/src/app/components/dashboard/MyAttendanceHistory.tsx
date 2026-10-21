"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { DataTable } from "@/app/components/dashboard/DataTable";
import { formatRecordedTime } from "@/app/components/dashboard/clockInOutcome";
import { extractErrorMessage } from "@/lib/api-client";
import { fetchHistory, type AttendanceDay } from "@/lib/attendance";

// The signed-in person's own attendance, one row per day, from
// GET /attendance/history (Phase 3). Read-only. Shared by every role that
// clocks in (Employee, Team Lead, HR Admin) — the API only ever returns the
// caller's own days, so there's nothing role-specific to vary. Same pattern
// as ProfilePageContent: each role's page sets its header and renders this.
//
// Two columns the sample version had are gone on purpose: "Branch" (a day's
// summary doesn't record which branch) and "Trust score" (no scoring exists
// until Phase 4). Showing invented values there would be worse than not
// showing the column.

// What a row means to the person, derived from the server's summary.
type DayKind = "ON_TIME" | "LATE" | "IN_PROGRESS" | "INCOMPLETE" | "ABSENT" | "HOLIDAY" | "REST_DAY";

function kindOf(day: AttendanceDay): DayKind {
  if (day.status === "ABSENT") return "ABSENT";
  if (day.status === "ON_HOLIDAY") return "HOLIDAY";
  if (day.status === "REST_DAY") return "REST_DAY";
  // PRESENT from here on.
  if (day.isIncomplete) return "INCOMPLETE";
  if (!day.lastClockOut) return "IN_PROGRESS";
  return day.isLate ? "LATE" : "ON_TIME";
}

// Next to the type so a new kind can't be added without a label and colour.
const KIND_STYLES: Record<DayKind, { label: string; className: string }> = {
  ON_TIME: { label: "On time", className: "bg-success/15 text-success" },
  LATE: { label: "Late", className: "bg-warning/15 text-warning" },
  IN_PROGRESS: { label: "In progress", className: "bg-primary/10 text-primary" },
  INCOMPLETE: { label: "No clock-out", className: "bg-alert/10 text-alert" },
  ABSENT: { label: "Absent", className: "bg-neutral/15 text-neutral" },
  HOLIDAY: { label: "Holiday", className: "bg-info/10 text-info" },
  REST_DAY: { label: "Rest day", className: "bg-neutral/10 text-neutral" },
};

const FILTERS = ["ALL", "ON_TIME", "LATE", "INCOMPLETE", "ABSENT"] as const;
type Filter = (typeof FILTERS)[number];

// Days back from today. The server caps a request at 93 days.
const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

/** "YYYY-MM-DD" for the browser's today minus `days - 1`, so the range includes today. */
function startOfRange(days: Range): string {
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * "Fri 16 Oct 2026". workDate is a calendar date in the organisation's zone,
 * not an instant — formatted as UTC so no timezone can move it a day.
 */
function formatWorkDate(workDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${workDate}T00:00:00Z`));
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

function KindBadge({ day }: { day: AttendanceDay }) {
  const kind = kindOf(day);
  const style = KIND_STYLES[kind];
  return (
    <span className={`inline-block rounded px-2 py-1 text-xs font-medium whitespace-nowrap ${style.className}`}>
      {style.label}
      {kind === "LATE" && day.lateMinutes > 0 ? ` · ${day.lateMinutes}m` : ""}
    </span>
  );
}

export function MyAttendanceHistory() {
  const [range, setRange] = useState<Range>(30);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [days, setDays] = useState<AttendanceDay[] | null>(null);
  // From the response: times show in the organisation's zone (decision 1.1).
  const [timeZone, setTimeZone] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);


  useEffect(() => {
    let isActive = true;
    fetchHistory(startOfRange(range))
      .then((history) => {
        if (!isActive) return;
        setDays(history.days);
        setTimeZone(history.timeZone);
        setError(null);
      })
      .catch((err) => {
        if (isActive) setError(extractErrorMessage(err));
      });
    return () => {
      isActive = false;
    };
  }, [range, reloadKey]);

  const filteredDays = useMemo(
    () => (days ?? []).filter((day) => filter === "ALL" || kindOf(day) === filter),
    [days, filter]
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              aria-pressed={filter === option}
              className={`rounded-md px-3 py-2 text-sm font-medium border ${
                filter === option
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-neutral/30 text-neutral hover:text-heading"
              }`}
            >
              {option === "ALL" ? "All" : KIND_STYLES[option].label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral">
          Show
          <select
            value={range}
            onChange={(event) => setRange(Number(event.target.value) as Range)}
            className="rounded-md border border-neutral/40 px-3 py-2 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {RANGES.map((option) => (
              <option key={option} value={option}>
                Last {option} days
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-alert/30 bg-alert/10 px-4 py-3">
          <p className="min-w-0 text-sm text-alert wrap-break-word">
            Couldn&apos;t load your attendance: {error}
          </p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="inline-flex items-center gap-2 text-sm font-medium text-heading hover:underline"
          >
            <RefreshCw className="h-4 w-4" strokeWidth={2} />
            Try again
          </button>
        </div>
      )}

      {days === null && !error ? (
        <p className="text-sm text-neutral">Loading your attendance…</p>
      ) : (
        <DataTable
          rows={filteredDays}
          getRowKey={(day) => day.workDate}
          emptyMessage={
            filter === "ALL"
              ? `No attendance recorded in the last ${range} days.`
              : "No days match this filter."
          }
          pageSize={10}
          itemLabel="days"
          renderCardHeader={(day) => (
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-heading">{formatWorkDate(day.workDate)}</p>
              <KindBadge day={day} />
            </div>
          )}
          columns={[
            {
              key: "date",
              header: "Date",
              hideOnMobile: true,
              render: (day) => (
                <span className="font-medium text-heading whitespace-nowrap">
                  {formatWorkDate(day.workDate)}
                </span>
              ),
            },
            {
              key: "clockIn",
              header: "Clock in",
              render: (day) => (
                <span className="text-neutral tabular-nums">
                  {day.firstClockIn ? formatRecordedTime(day.firstClockIn, timeZone) : "—"}
                </span>
              ),
            },
            {
              key: "clockOut",
              header: "Clock out",
              render: (day) => (
                <span className="text-neutral tabular-nums">
                  {day.lastClockOut ? formatRecordedTime(day.lastClockOut, timeZone) : "—"}
                </span>
              ),
            },
            {
              key: "worked",
              header: "Worked",
              render: (day) => (
                <span className="text-neutral tabular-nums">{formatMinutes(day.workedMinutes)}</span>
              ),
            },
            {
              key: "break",
              header: "Break",
              render: (day) => (
                <span className="text-neutral tabular-nums">{formatMinutes(day.breakMinutes)}</span>
              ),
            },
            {
              key: "overtime",
              header: "Overtime",
              render: (day) => (
                <span className="text-neutral tabular-nums">{formatMinutes(day.overtimeMinutes)}</span>
              ),
            },
            {
              key: "status",
              header: "Status",
              hideOnMobile: true,
              render: (day) => <KindBadge day={day} />,
            },
          ]}
        />
      )}
    </div>
  );
}
