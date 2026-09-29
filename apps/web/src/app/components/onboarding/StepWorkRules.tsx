import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  workRulesSchema,
  type WorkRulesValues,
} from "@/lib/validation/onboarding";

interface StepWorkRulesProps {
  defaultValues?: Partial<WorkRulesValues>;
  onNext: (values: WorkRulesValues) => void;
  onBack?: () => void;
}

const StepWorkRules = ({
  defaultValues,
  onNext,
  onBack,
}: StepWorkRulesProps) => {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<WorkRulesValues>({
    resolver: zodResolver(workRulesSchema),
    defaultValues: {
      startTime: "08:00",
      endTime: "17:00",
      gracePeriodMinutes: 10,
      overtimeAfterHours: 17,
      overtimeMultiplier: 1.5,
      ...defaultValues,
    },
  });

  const endTime = watch("endTime");
  const overtimeMultiplier = watch("overtimeMultiplier");

  // Overtime kicks in right at the end of the configured workday —
  // there's no separate "hours worked" threshold the user picks, it's
  // just whatever End time is set to above. Keep overtimeAfterHours
  // (the schema's clock-hour field) in sync automatically whenever
  // End time changes, instead of asking the user to pick it twice.
  useEffect(() => {
    const hour = Number(endTime?.split(":")[0]);
    if (!Number.isNaN(hour)) {
      setValue("overtimeAfterHours", hour, { shouldValidate: true });
    }
  }, [endTime, setValue]);

  const onSubmit = (values: WorkRulesValues) => {
    onNext(values);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="startTime"
            className="block text-sm font-medium text-heading mb-1"
          >
            Start time
          </label>
          <input
            id="startTime"
            type="time"
            {...register("startTime")}
            className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {errors.startTime && (
            <p className="mt-1 text-sm text-alert">
              {errors.startTime.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="endTime"
            className="block text-sm font-medium text-heading mb-1"
          >
            End time
          </label>
          <input
            id="endTime"
            type="time"
            {...register("endTime")}
            className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {errors.endTime && (
            <p className="mt-1 text-sm text-alert">{errors.endTime.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            max={60}
            {...register("gracePeriodMinutes", { valueAsNumber: true })}
            className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {errors.gracePeriodMinutes && (
            <p className="mt-1 text-sm text-alert">
              {errors.gracePeriodMinutes.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="overtimeMultiplier"
            className="block text-sm font-medium text-heading mb-1"
          >
            Overtime rule
          </label>
          <select
            id="overtimeMultiplier"
            {...register("overtimeMultiplier", { valueAsNumber: true })}
            className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value={1}>No overtime</option>
            <option value={1.5}>After {endTime || "--:--"} — &times;1.5</option>
            <option value={2}>After {endTime || "--:--"} — &times;2.0</option>
          </select>
          {/* Auto-derived from End time above, see the useEffect — not
              directly editable, just needs to be part of the form data
              the schema validates and onNext() hands back up. */}
          <input type="hidden" {...register("overtimeAfterHours", { valueAsNumber: true })} />
          {(errors.overtimeAfterHours || errors.overtimeMultiplier) && (
            <p className="mt-1 text-sm text-alert">
              {errors.overtimeAfterHours?.message ?? errors.overtimeMultiplier?.message}
            </p>
          )}
        </div>
      </div>

      {overtimeMultiplier > 1 && (
        <p className="text-xs text-neutral -mt-2">
          Hours worked past {endTime || "the end of the workday"} are paid at{" "}
          &times;{overtimeMultiplier}.
        </p>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-neutral/20">
        <button
          type="button"
          onClick={onBack}
          disabled={!onBack}
          className="text-sm font-medium text-neutral hover:text-heading disabled:opacity-40 disabled:cursor-not-allowed"
        >
          &larr; Back
        </button>
        <button
          type="submit"
          className="rounded-md bg-primary text-white px-5 py-2 text-sm font-medium hover:bg-primary/90"
        >
          Continue &rarr;
        </button>
      </div>
    </form>
  );
};

export default StepWorkRules;
