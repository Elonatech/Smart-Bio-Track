"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useModalA11y } from "@/lib/useModalA11y";
import { extractErrorMessage } from "@/lib/api-client";
import {
  OVERTIME_RATES,
  WEEKDAYS,
  clockToMinutes,
  type WorkRule,
  type WorkRuleInput,
} from "@/lib/workRules";

// Create / edit a work rule. Fields mirror CreateWorkRuleDto
// (apps/api/src/work-rules/dto/work-rule.dto.ts) and use the same limits, so
// the server rarely has to refuse what this lets through. When it does
// (a duplicate name, say), its message is shown here and the form stays open.
//
// No "break" field: the backend has no break allowance — breaks are measured
// from actual Start/End Break punches instead.
const workRuleFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, { message: "Rule name is required" })
      .max(60, { message: "Keep the name under 60 characters" }),
    workingDays: z.array(z.number()).min(1, { message: "Choose at least one working day" }),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, { message: "Start time is required" }),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, { message: "End time is required" }),
    gracePeriodMinutes: z
      .number({ message: "Enter minutes" })
      .int()
      .min(0)
      .max(180, { message: "Grace can't be more than 180 minutes" }),
    tracksOvertime: z.boolean(),
    overtimeAfterHours: z
      .number({ message: "Enter hours" })
      .min(0.5, { message: "At least half an hour" })
      .max(24, { message: "At most 24 hours" }),
    overtimeMultiplier: z.number(),
    isDefault: z.boolean(),
  })
  .refine((v) => clockToMinutes(v.endTime) > clockToMinutes(v.startTime), {
    // The server's own rule — overnight shifts aren't supported yet.
    message: "End time must be after start time (overnight shifts aren't supported yet)",
    path: ["endTime"],
  });

type WorkRuleFormValues = z.infer<typeof workRuleFormSchema>;

interface WorkRuleFormModalProps {
  /** Present = editing; absent = creating. */
  rule?: WorkRule;
  onClose: () => void;
  /** Saves to the server. Throws on refusal; the modal shows the reason. */
  onSave: (input: WorkRuleInput) => Promise<void>;
}

function defaultsFrom(rule?: WorkRule): WorkRuleFormValues {
  return {
    name: rule?.name ?? "",
    workingDays: rule?.workingDays ?? [1, 2, 3, 4, 5],
    startTime: rule?.startTime ?? "08:00",
    endTime: rule?.endTime ?? "17:00",
    gracePeriodMinutes: rule?.gracePeriodMinutes ?? 15,
    tracksOvertime: rule ? rule.overtimeAfterMinutes !== null : true,
    overtimeAfterHours: rule?.overtimeAfterMinutes != null ? rule.overtimeAfterMinutes / 60 : 8,
    overtimeMultiplier: rule?.overtimeMultiplier ?? 1.5,
    isDefault: rule?.isDefault ?? false,
  };
}

const inputClass =
  "w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

export function WorkRuleFormModal({ rule, onClose, onSave }: WorkRuleFormModalProps) {
  const isEditing = Boolean(rule);
  const [serverError, setServerError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useModalA11y(panelRef, onClose);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<WorkRuleFormValues>({
    resolver: zodResolver(workRuleFormSchema),
    defaultValues: defaultsFrom(rule),
  });

  const tracksOvertime = useWatch({ control, name: "tracksOvertime" });

  const onSubmit = async (values: WorkRuleFormValues) => {
    setServerError(null);
    try {
      await onSave({
        name: values.name,
        workingDays: [...values.workingDays].sort((a, b) => a - b),
        startTime: values.startTime,
        endTime: values.endTime,
        gracePeriodMinutes: values.gracePeriodMinutes,
        overtimeAfterMinutes: values.tracksOvertime
          ? Math.round(values.overtimeAfterHours * 60)
          : null,
        overtimeMultiplier: values.overtimeMultiplier,
        // Only ever sent as true: the server makes the first rule the
        // default itself, and un-defaulting is done by defaulting another.
        ...(values.isDefault && !rule?.isDefault ? { isDefault: true } : {}),
      });
      onClose();
    } catch (error) {
      setServerError(extractErrorMessage(error));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-rule-form-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg max-h-[90dvh] overflow-y-auto bg-surface rounded-xl border border-neutral/20 p-6 outline-none"
      >
        <div className="flex items-start justify-between mb-4">
          <h2 id="work-rule-form-title" className="text-lg font-semibold text-heading">
            {isEditing ? "Edit time regulation" : "New time regulation"}
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

        {serverError && (
          <div className="mb-4 rounded-md bg-alert/10 border border-alert/30 text-alert text-sm px-3 py-2 wrap-break-word">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-heading mb-1">
              Rule name
            </label>
            <input
              id="name"
              type="text"
              placeholder="e.g. Standard hours"
              {...register("name")}
              className={inputClass}
            />
            {errors.name && <p className="mt-1 text-sm text-alert">{errors.name.message}</p>}
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-heading mb-1">Working days</legend>
            <Controller
              control={control}
              name="workingDays"
              render={({ field }) => (
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((day) => {
                    const isOn = field.value.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        aria-pressed={isOn}
                        onClick={() =>
                          field.onChange(
                            isOn
                              ? field.value.filter((d) => d !== day.value)
                              : [...field.value, day.value]
                          )
                        }
                        className={`min-w-11 rounded-md border px-2.5 py-1.5 text-sm font-medium ${
                          isOn
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-neutral/30 text-neutral hover:text-heading"
                        }`}
                      >
                        {day.short}
                      </button>
                    );
                  })}
                </div>
              )}
            />
            {errors.workingDays && (
              <p className="mt-1 text-sm text-alert">{errors.workingDays.message}</p>
            )}
          </fieldset>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="startTime" className="block text-sm font-medium text-heading mb-1">
                Start time
              </label>
              <input id="startTime" type="time" {...register("startTime")} className={inputClass} />
              {errors.startTime && (
                <p className="mt-1 text-sm text-alert">{errors.startTime.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="endTime" className="block text-sm font-medium text-heading mb-1">
                End time
              </label>
              <input id="endTime" type="time" {...register("endTime")} className={inputClass} />
            </div>
          </div>
          {errors.endTime && <p className="-mt-2 text-sm text-alert">{errors.endTime.message}</p>}

          <div>
            <label
              htmlFor="gracePeriodMinutes"
              className="block text-sm font-medium text-heading mb-1"
            >
              Grace period (minutes)
            </label>
            <input
              id="gracePeriodMinutes"
              type="number"
              min={0}
              max={180}
              {...register("gracePeriodMinutes", { valueAsNumber: true })}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-neutral">
              Clocking in within this many minutes of the start time isn&apos;t counted as late.
            </p>
            {errors.gracePeriodMinutes && (
              <p className="mt-1 text-sm text-alert">{errors.gracePeriodMinutes.message}</p>
            )}
          </div>

          <div className="rounded-md border border-neutral/20 p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-heading">
              <input type="checkbox" {...register("tracksOvertime")} className="h-4 w-4 accent-primary" />
              Track overtime
            </label>
            {tracksOvertime && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="overtimeAfterHours"
                    className="block text-sm font-medium text-heading mb-1"
                  >
                    After this many hours worked
                  </label>
                  <input
                    id="overtimeAfterHours"
                    type="number"
                    step={0.5}
                    min={0.5}
                    max={24}
                    {...register("overtimeAfterHours", { valueAsNumber: true })}
                    className={inputClass}
                  />
                  {errors.overtimeAfterHours && (
                    <p className="mt-1 text-sm text-alert">{errors.overtimeAfterHours.message}</p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="overtimeMultiplier"
                    className="block text-sm font-medium text-heading mb-1"
                  >
                    Overtime rate
                  </label>
                  <select
                    id="overtimeMultiplier"
                    {...register("overtimeMultiplier", { valueAsNumber: true })}
                    className={inputClass}
                  >
                    {OVERTIME_RATES.map((rate) => (
                      <option key={rate.value} value={rate.value}>
                        {rate.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Already the default: nothing to toggle — another rule has to
              take over instead, which is the server's rule too. */}
          {rule?.isDefault ? (
            <p className="text-sm text-neutral">
              This is your organization&apos;s default rule. To change that, make another rule the
              default.
            </p>
          ) : (
            <label className="flex items-start gap-2 text-sm text-heading">
              <input type="checkbox" {...register("isDefault")} className="mt-0.5 h-4 w-4 accent-primary" />
              <span>
                Make this the default rule
                <span className="block text-xs text-neutral">
                  Used for everyone whose branch doesn&apos;t have its own rule.
                </span>
              </span>
            </label>
          )}

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
              {isSubmitting ? "Saving..." : isEditing ? "Save changes" : "Create rule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
