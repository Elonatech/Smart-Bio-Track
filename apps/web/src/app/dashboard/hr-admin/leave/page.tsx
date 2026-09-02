"use client";

import { useMemo, useState } from "react";
import { CircleCheck, CircleX, Clock } from "lucide-react";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";

// Leave requests HR decides on. UI only — there's no Leave model in
// prisma/schema.prisma and no leave module in apps/api/src, so these are
// example rows and Approve/Decline are disabled: there's no endpoint to
// record a decision, and a button that silently does nothing is worse
// than one that says why it can't. Same call as the Review Queue.

type LeaveStatus = "PENDING" | "APPROVED" | "DECLINED";
type LeaveType = "ANNUAL" | "SICK" | "COMPASSIONATE" | "UNPAID";

interface LeaveRequest {
  id: string;
  employeeName: string;
  type: LeaveType;
  // Pre-formatted; a real API would send ISO dates to format client-side.
  dateRange: string;
  days: number;
  status: LeaveStatus;
  // Only set once a decision has been made.
  decidedBy?: string;
  decidedOn?: string;
}

const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  ANNUAL: "Annual leave",
  SICK: "Sick leave",
  COMPASSIONATE: "Compassionate",
  UNPAID: "Unpaid leave",
};

const STATUS_META: Record<
  LeaveStatus,
  { label: string; pill: string; icon: typeof Clock }
> = {
  PENDING: {
    label: "Pending",
    pill: "bg-warning/10 text-warning border-warning/30",
    icon: Clock,
  },
  APPROVED: {
    label: "Approved",
    pill: "bg-success/10 text-success border-success/30",
    icon: CircleCheck,
  },
  DECLINED: {
    label: "Declined",
    pill: "bg-alert/10 text-alert border-alert/30",
    icon: CircleX,
  },
};

const LEAVE_REQUESTS: LeaveRequest[] = [
  {
    id: "1",
    employeeName: "Aisha Bello",
    type: "ANNUAL",
    dateRange: "17 – 21 Aug 2026",
    days: 5,
    status: "PENDING",
  },
  {
    id: "2",
    employeeName: "Tunde Adeyemi",
    type: "SICK",
    dateRange: "11 Aug 2026",
    days: 1,
    status: "PENDING",
  },
  {
    id: "3",
    employeeName: "Ngozi Eze",
    type: "COMPASSIONATE",
    dateRange: "12 – 13 Aug 2026",
    days: 2,
    status: "PENDING",
  },
  {
    id: "4",
    employeeName: "Ibrahim Musa",
    type: "ANNUAL",
    dateRange: "3 – 7 Aug 2026",
    days: 5,
    status: "APPROVED",
    decidedBy: "Aisha Suleiman",
    decidedOn: "2 Aug 2026",
  },
  {
    id: "5",
    employeeName: "Chinedu Okafor",
    type: "UNPAID",
    dateRange: "24 – 28 Aug 2026",
    days: 5,
    status: "DECLINED",
    decidedBy: "Aisha Suleiman",
    decidedOn: "19 Aug 2026",
  },
];

const FILTERS = ["PENDING", "APPROVED", "DECLINED", "ALL"] as const;
type Filter = (typeof FILTERS)[number];

const NO_ENDPOINT_HINT = "No endpoint records a leave decision yet.";

export default function HRAdminLeavePage() {
  // Defaults to Pending — the only tab with anything to do on it.
  const [filter, setFilter] = useState<Filter>("PENDING");

  const pendingCount = LEAVE_REQUESTS.filter(
    (request) => request.status === "PENDING"
  ).length;

  usePageHeader(
    "Leave administration",
    `${pendingCount} awaiting decision · approved leave is excluded from absence counts`
  );

  const visibleRequests = useMemo(
    () =>
      filter === "ALL"
        ? LEAVE_REQUESTS
        : LEAVE_REQUESTS.filter((request) => request.status === filter),
    [filter]
  );

  // Counts come off the full list, not the filtered one, so each tab
  // shows its own total rather than whatever is currently on screen.
  function countFor(target: Filter): number {
    return target === "ALL"
      ? LEAVE_REQUESTS.length
      : LEAVE_REQUESTS.filter((request) => request.status === target).length;
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            className={`rounded-md px-3 py-2 text-sm font-medium border ${
              filter === option
                ? "border-primary bg-primary/10 text-primary"
                : "border-neutral/30 text-neutral hover:text-heading"
            }`}
          >
            {option === "ALL" ? "All" : STATUS_META[option].label}
            <span className="ml-1.5 tabular-nums opacity-70">
              {countFor(option)}
            </span>
          </button>
        ))}
      </div>

      <div className="bg-surface border border-neutral/20 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral/20">
          <h6 className="text-[15px] font-semibold text-heading">Requests</h6>
        </div>

        {visibleRequests.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-neutral">
            {filter === "PENDING"
              ? "Nothing awaiting a decision. Every request has been handled."
              : filter === "ALL"
                ? "No leave requests yet."
                : `No ${STATUS_META[filter].label.toLowerCase()} requests.`}
          </p>
        )}

        {visibleRequests.map((request) => {
          const meta = STATUS_META[request.status];
          const StatusIcon = meta.icon;

          return (
            <div
              key={request.id}
              className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-neutral/10 last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-heading truncate">
                  {request.employeeName}
                </p>
                <p className="text-[12px] text-neutral">
                  {LEAVE_TYPE_LABEL[request.type]} · {request.dateRange} ·{" "}
                  {request.days} {request.days === 1 ? "day" : "days"}
                </p>
                {/* Who decided it and when — the reference leaves this
                    out, but it's the first thing anyone asks about a
                    request that's already been settled. */}
                {request.decidedBy && (
                  <p className="text-[12px] text-neutral mt-0.5">
                    {meta.label} by {request.decidedBy} · {request.decidedOn}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium ${meta.pill}`}
                >
                  <StatusIcon className="h-3 w-3" strokeWidth={2} />
                  {meta.label}
                </span>

                {request.status === "PENDING" && (
                  <>
                    <button
                      type="button"
                      disabled
                      title={NO_ENDPOINT_HINT}
                      className="rounded-md border border-neutral/30 px-3 py-2 text-sm font-medium text-heading disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      disabled
                      title={NO_ENDPOINT_HINT}
                      className="rounded-md bg-primary text-white px-3 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Approve
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {pendingCount > 0 && filter === "PENDING" && (
        <p className="mt-3 text-[12px] text-neutral">
          Decisions go live once the leave service ships.
        </p>
      )}
    </div>
  );
}
