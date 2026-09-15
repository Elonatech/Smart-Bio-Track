"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// UI only, same as HR's Leave Administration screen — there is no Leave
// model in prisma/schema.prisma and no leave module in apps/api/src, so
// a submitted request only updates this browser's own list. See
// MyLeaveRequestsList.tsx for where that list lives.

export type LeaveType = "ANNUAL" | "SICK" | "COMPASSIONATE" | "UNPAID";

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  ANNUAL: "Annual leave",
  SICK: "Sick leave",
  COMPASSIONATE: "Compassionate",
  UNPAID: "Unpaid leave",
};

const leaveRequestSchema = z
  .object({
    type: z.enum(["ANNUAL", "SICK", "COMPASSIONATE", "UNPAID"]),
    startDate: z.string().min(1, { message: "Start date is required" }),
    endDate: z.string().min(1, { message: "End date is required" }),
    reason: z.string().min(5, { message: "Give a brief reason — at least 5 characters" }),
  })
  .superRefine((values, ctx) => {
    if (values.endDate < values.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date can't be before the start date",
      });
    }
  });

export type LeaveRequestValues = z.infer<typeof leaveRequestSchema>;

interface LeaveRequestModalProps {
  onClose: () => void;
  onSubmit: (values: LeaveRequestValues) => void;
}

export function LeaveRequestModal({ onClose, onSubmit }: LeaveRequestModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LeaveRequestValues>({
    resolver: zodResolver(leaveRequestSchema),
    defaultValues: { type: "ANNUAL" },
  });

  const handleFormSubmit = (values: LeaveRequestValues) => {
    setSubmitting(true);
    onSubmit(values);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-lg bg-surface rounded-xl border border-neutral/20 p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold text-heading">Request leave</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-neutral hover:text-heading"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div>
            <label htmlFor="type" className="block text-sm font-medium text-heading mb-1">
              Leave type
            </label>
            <select
              id="type"
              {...register("type")}
              className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {(Object.keys(LEAVE_TYPE_LABEL) as LeaveType[]).map((type) => (
                <option key={type} value={type}>
                  {LEAVE_TYPE_LABEL[type]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="startDate" className="block text-sm font-medium text-heading mb-1">
                Start date
              </label>
              <input
                id="startDate"
                type="date"
                {...register("startDate")}
                className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {errors.startDate && (
                <p className="mt-1 text-sm text-alert">{errors.startDate.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="endDate" className="block text-sm font-medium text-heading mb-1">
                End date
              </label>
              <input
                id="endDate"
                type="date"
                {...register("endDate")}
                className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {errors.endDate && (
                <p className="mt-1 text-sm text-alert">{errors.endDate.message}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="reason" className="block text-sm font-medium text-heading mb-1">
              Reason
            </label>
            <textarea
              id="reason"
              rows={3}
              placeholder="Briefly explain why you're requesting this leave."
              {...register("reason")}
              className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {errors.reason && (
              <p className="mt-1 text-sm text-alert">{errors.reason.message}</p>
            )}
          </div>

          <p className="text-xs text-neutral border-t border-neutral/20 pt-3">
            This adds to your list on this screen only — leave requests
            aren&apos;t saved to the server yet.
          </p>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-neutral/30 px-4 py-2 text-sm font-medium text-heading hover:bg-neutral/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
            >
              Submit request
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
