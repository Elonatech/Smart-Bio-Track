"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// NOTE: purely local state — there's no backend WorkRule model or API
// yet (confirmed: no controller, service, or Prisma model exists).
// This form just hands validated values back to the parent page's
// in-memory array; nothing is persisted, and a refresh loses changes.
// Swap this for real appClient.post/put calls once a backend exists,
// same pattern as OfficeFormModal.
const workRuleFormSchema = z.object({
  name: z.string().min(2, { message: "Rule name is required" }),
  startTime: z.string().min(1, { message: "Start time is required" }),
  endTime: z.string().min(1, { message: "End time is required" }),
  days: z.string().min(1, { message: "Days are required" }),
  gracePeriodMinutes: z.number().min(0).max(60),
  breakMinutes: z.number().min(0).max(180),
  overtimeAfterHours: z.number().min(1).max(16),
});

type WorkRuleFormValues = z.infer<typeof workRuleFormSchema>;

export interface WorkRule extends WorkRuleFormValues {
  id: string;
}

interface WorkRuleFormModalProps {
  rule?: WorkRule; // present = editing; absent = creating
  onClose: () => void;
  onSave: (values: WorkRuleFormValues) => void;
}

export function WorkRuleFormModal({ rule, onClose, onSave }: WorkRuleFormModalProps) {
  const isEditing = Boolean(rule);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<WorkRuleFormValues>({
    resolver: zodResolver(workRuleFormSchema),
    defaultValues: {
      name: rule?.name ?? "",
      startTime: rule?.startTime ?? "08:00",
      endTime: rule?.endTime ?? "17:00",
      days: rule?.days ?? "Mon–Fri",
      gracePeriodMinutes: rule?.gracePeriodMinutes ?? 15,
      breakMinutes: rule?.breakMinutes ?? 60,
      overtimeAfterHours: rule?.overtimeAfterHours ?? 9,
    },
  });

  const onSubmit = (values: WorkRuleFormValues) => {
    setIsSubmitting(true);
    onSave(values);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-lg bg-surface rounded-xl border border-neutral/20 p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold text-heading">
            {isEditing ? "Edit work rule" : "New work rule"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-neutral hover:text-heading"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-heading mb-1">
              Rule name
            </label>
            <input
              id="name"
              type="text"
              placeholder="e.g. Standard Corporate"
              {...register("name")}
              className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-alert">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="startTime" className="block text-sm font-medium text-heading mb-1">
                Start time
              </label>
              <input
                id="startTime"
                type="time"
                {...register("startTime")}
                className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="endTime" className="block text-sm font-medium text-heading mb-1">
                End time
              </label>
              <input
                id="endTime"
                type="time"
                {...register("endTime")}
                className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label htmlFor="days" className="block text-sm font-medium text-heading mb-1">
              Days
            </label>
            <input
              id="days"
              type="text"
              placeholder="e.g. Mon–Fri"
              {...register("days")}
              className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {errors.days && (
              <p className="mt-1 text-sm text-alert">{errors.days.message}</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="gracePeriodMinutes"
                className="block text-sm font-medium text-heading mb-1"
              >
                Grace (min)
              </label>
              <input
                id="gracePeriodMinutes"
                type="number"
                min={0}
                max={60}
                {...register("gracePeriodMinutes", { valueAsNumber: true })}
                className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="breakMinutes" className="block text-sm font-medium text-heading mb-1">
                Break (min)
              </label>
              <input
                id="breakMinutes"
                type="number"
                min={0}
                max={180}
                {...register("breakMinutes", { valueAsNumber: true })}
                className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label
                htmlFor="overtimeAfterHours"
                className="block text-sm font-medium text-heading mb-1"
              >
                Overtime after (h)
              </label>
              <input
                id="overtimeAfterHours"
                type="number"
                min={1}
                max={16}
                {...register("overtimeAfterHours", { valueAsNumber: true })}
                className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

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
              disabled={isSubmitting}
              className="rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
            >
              Save rule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
