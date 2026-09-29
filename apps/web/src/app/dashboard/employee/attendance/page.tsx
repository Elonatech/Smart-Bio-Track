"use client";

import { useMemo, useState } from "react";
import { Info, Search } from "lucide-react";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import { DataTable } from "@/app/components/dashboard/DataTable";

// Seeded example data — there is no Attendance/Punch Prisma model and
// no attendance module in apps/api/src, so nothing here comes from the
// backend. It's structured the way a real API would return it (one row
// per worked day) so swapping the array for an
// appClient.get("/attendance/me") call later is a small change.
type DayStatus = "ON_TIME" | "LATE" | "ABSENT" | "FLAGGED";

interface AttendanceDay {
  id: string;
  date: string; // pre-formatted; a real API would send an ISO string
  clockIn: string | null;
  clockOut: string | null;
  totalHours: string;
  office: string;
  status: DayStatus;
  trustScore: number | null;
}

const INITIAL_DAYS: AttendanceDay[] = [
  {
    id: "1",
    date: "26 Aug 2026",
    clockIn: "08:42",
    clockOut: "17:31",
    totalHours: "8h 49m",
    office: "Lagos HQ",
    status: "ON_TIME",
    trustScore: 96,
  },
  {
    id: "2",
    date: "25 Aug 2026",
    clockIn: "08:57",
    clockOut: "17:12",
    totalHours: "8h 15m",
    office: "Lagos HQ",
    status: "ON_TIME",
    trustScore: 91,
  },
  {
    id: "3",
    date: "24 Aug 2026",
    clockIn: "09:26",
    clockOut: "17:40",
    totalHours: "8h 14m",
    office: "Lagos HQ",
    status: "LATE",
    trustScore: 88,
  },
  {
    id: "4",
    date: "21 Aug 2026",
    clockIn: "08:39",
    clockOut: "16:02",
    totalHours: "7h 23m",
    office: "Abuja Office",
    status: "FLAGGED",
    trustScore: 58,
  },
  {
    id: "5",
    date: "20 Aug 2026",
    clockIn: null,
    clockOut: null,
    totalHours: "—",
    office: "—",
    status: "ABSENT",
    trustScore: null,
  },
];

// Kept next to the type so adding a status forces you to give it a
// label and colour here too, rather than falling through to unstyled
// text somewhere in the table.
const STATUS_STYLES: Record<DayStatus, { label: string; className: string }> = {
  ON_TIME: { label: "On time", className: "bg-success/15 text-success" },
  LATE: { label: "Late", className: "bg-warning/15 text-warning" },
  ABSENT: { label: "Absent", className: "bg-neutral/15 text-neutral" },
  FLAGGED: { label: "Flagged", className: "bg-alert/10 text-alert" },
};

const STATUS_FILTERS = ["ALL", "ON_TIME", "LATE", "ABSENT", "FLAGGED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export default function EmployeeAttendancePage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  usePageHeader("Attendance history", "Your clock-in and clock-out record");

  // useMemo so the filtering only re-runs when the search text or the
  // selected status actually changes — not on every unrelated re-render.
  const filteredDays = useMemo(() => {
    const query = search.trim().toLowerCase();
    return INITIAL_DAYS.filter((day) => {
      const matchesStatus =
        statusFilter === "ALL" || day.status === statusFilter;
      const matchesSearch =
        !query ||
        [day.date, day.office].join(" ").toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [search, statusFilter]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={`rounded-md px-3 py-2 text-sm font-medium border ${
                statusFilter === filter
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-neutral/30 text-neutral hover:text-heading"
              }`}
            >
              {filter === "ALL" ? "All" : STATUS_STYLES[filter].label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by date or office"
            className="w-full rounded-md border border-neutral/40 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 bg-primary/10 text-primary text-sm rounded-md px-4 py-2.5 mb-4">
        <Info className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        Example records — your real history appears here once the attendance
        service is connected.
      </div>

      <DataTable
        rows={filteredDays}
        getRowKey={(day) => day.id}
        emptyMessage="No attendance records match these filters."
        pageSize={10}
        itemLabel="days"
        renderCardHeader={(day) => (
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-heading">{day.date}</p>
            <span
              className={`inline-block rounded px-2 py-1 text-xs font-medium ${
                STATUS_STYLES[day.status].className
              }`}
            >
              {STATUS_STYLES[day.status].label}
            </span>
          </div>
        )}
        columns={[
          {
            key: "date",
            header: "Date",
            hideOnMobile: true,
            render: (day) => (
              <span className="font-medium text-heading whitespace-nowrap">
                {day.date}
              </span>
            ),
          },
          {
            key: "clockIn",
            header: "Clock in",
            render: (day) => (
              <span className="text-neutral tabular-nums">
                {day.clockIn ?? "—"}
              </span>
            ),
          },
          {
            key: "clockOut",
            header: "Clock out",
            render: (day) => (
              <span className="text-neutral tabular-nums">
                {day.clockOut ?? "—"}
              </span>
            ),
          },
          {
            key: "totalHours",
            header: "Total",
            render: (day) => (
              <span className="text-neutral tabular-nums">{day.totalHours}</span>
            ),
          },
          {
            key: "office",
            header: "Office",
            render: (day) => <span className="text-neutral">{day.office}</span>,
          },
          {
            key: "status",
            header: "Status",
            hideOnMobile: true,
            render: (day) => (
              <span
                className={`inline-block rounded px-2 py-1 text-xs font-medium ${
                  STATUS_STYLES[day.status].className
                }`}
              >
                {STATUS_STYLES[day.status].label}
              </span>
            ),
          },
          {
            key: "trustScore",
            header: "Trust score",
            render: (day) => (
              <span className="text-neutral tabular-nums">
                {day.trustScore ?? "—"}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
