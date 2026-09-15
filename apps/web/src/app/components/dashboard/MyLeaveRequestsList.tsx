"use client";

import { useState } from "react";
import { Plus, CircleCheck, CircleX, Clock } from "lucide-react";
import { useToast } from "@/app/components/Toast";
import {
  LeaveRequestModal,
  LEAVE_TYPE_LABEL,
  type LeaveType,
  type LeaveRequestValues,
} from "@/app/components/dashboard/LeaveRequestModal";

// Shared by the Employee and Team Lead "Leave Requests" pages — same
// list markup and submit flow either way, since both are just someone
// requesting their own leave. HR's decision queue is the separate,
// org-wide view at dashboard/hr-admin/leave.

type LeaveStatus = "PENDING" | "APPROVED" | "DECLINED";

interface MyLeaveRequest {
  id: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  submittedOn: string;
}

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

// A couple of seeded rows so the page isn't blank on first load —
// mirrors the pattern HR's Leave Administration page already uses.
const INITIAL_REQUESTS: MyLeaveRequest[] = [
  {
    id: "1",
    type: "ANNUAL",
    startDate: "2026-08-17",
    endDate: "2026-08-21",
    days: 5,
    reason: "Family trip planned earlier this year.",
    status: "PENDING",
    submittedOn: "5 Aug 2026",
  },
  {
    id: "2",
    type: "SICK",
    startDate: "2026-07-11",
    endDate: "2026-07-11",
    days: 1,
    reason: "Down with a fever.",
    status: "APPROVED",
    submittedOn: "11 Jul 2026",
  },
];

function formatDateRange(startDate: string, endDate: string): string {
  const format = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return startDate === endDate ? format(startDate) : `${format(startDate)} – ${format(endDate)}`;
}

function countDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

interface MyLeaveRequestsListProps {
  emptyMessage: string;
}

export function MyLeaveRequestsList({ emptyMessage }: MyLeaveRequestsListProps) {
  const toast = useToast();
  const [requests, setRequests] = useState<MyLeaveRequest[]>(INITIAL_REQUESTS);
  const [showModal, setShowModal] = useState(false);

  function handleSubmit(values: LeaveRequestValues) {
    const newRequest: MyLeaveRequest = {
      id: crypto.randomUUID(),
      type: values.type,
      startDate: values.startDate,
      endDate: values.endDate,
      days: countDays(values.startDate, values.endDate),
      reason: values.reason,
      status: "PENDING",
      submittedOn: new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    };
    setRequests((prev) => [newRequest, ...prev]);
    setShowModal(false);
    toast.success(
      "Leave request submitted",
      "Added to this screen only — it isn't sent anywhere for a decision yet."
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-6">
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2.5 rounded-md hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Request leave
        </button>
      </div>

      <div className="bg-surface border border-neutral/20 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral/20">
          <h6 className="text-[15px] font-semibold text-heading">Your requests</h6>
        </div>

        {requests.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-neutral">{emptyMessage}</p>
        )}

        {requests.map((request) => {
          const meta = STATUS_META[request.status];
          const StatusIcon = meta.icon;
          return (
            <div
              key={request.id}
              className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-neutral/10 last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-heading">
                  {LEAVE_TYPE_LABEL[request.type]}
                </p>
                <p className="text-[12px] text-neutral">
                  {formatDateRange(request.startDate, request.endDate)} ·{" "}
                  {request.days} {request.days === 1 ? "day" : "days"} · submitted{" "}
                  {request.submittedOn}
                </p>
                <p className="text-[12px] text-neutral mt-0.5 truncate max-w-md">
                  {request.reason}
                </p>
              </div>

              <span
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium shrink-0 ${meta.pill}`}
              >
                <StatusIcon className="h-3 w-3" strokeWidth={2} />
                {meta.label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[12px] text-neutral">
        Requests submitted here go live for HR to act on once the leave
        service ships.
      </p>

      {showModal && (
        <LeaveRequestModal onClose={() => setShowModal(false)} onSubmit={handleSubmit} />
      )}
    </div>
  );
}
