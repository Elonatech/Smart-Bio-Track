import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  workRulesSchema,
  type WorkRulesValues,
} from "@/lib/validation/onboarding";
import {
  hoursBetween,
  overtimeExample,
  WORKING_DAYS_PER_MONTH,
} from "@/lib/overtime";

const naira = (amount: number) => `₦${Math.round(amount).toLocaleString("en-NG")}`;

// Illustrative figures for the "how it's calculated" box only.
const EXAMPLE_OVERTIME_HOURS = 2;

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

  const startTime = watch("startTime");
  const endTime = watch("endTime");
  const overtimeMultiplier = watch("overtimeMultiplier");

  // The example's salary is local to this box — deliberately NOT a form
  // field, and never will be: the product exports hours and does not store
  // salaries (see the Payroll page). The box exists so a client can see how
  // a monthly salary becomes an overtime rate in the payroll tool they
  // already use. Kept as a string so clearing the box doesn't turn into
  // NaN mid-edit.
  const [exampleSalary, setExampleSalary] = useState("300000");
  const dailyHours = hoursBetween(startTime, endTime);
  const example = overtimeExample({
    monthlySalary: Number(exampleSalary),
    dailyHours,
    multiplier: overtimeMultiplier,
    overtimeHours: EXAMPLE_OVERTIME_HOURS,
  });

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
            Overtime rate
          </label>
          {/* Four distinct rates. This used to offer "No overtime" and
              "x1.0" with the same value (1), so the form couldn't tell
              them apart and "Back" always showed the first one. x1.0 is
              kept as a real choice — hours past the end time are still
              counted, just paid at the normal rate, which is the standard
              "straight time" option. */}
          <select
            id="overtimeMultiplier"
            {...register("overtimeMultiplier", { valueAsNumber: true })}
            className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value={1}>Normal rate — &times;1.0</option>
            <option value={1.5}>Time and a half — &times;1.5</option>
            <option value={2}>Double time — &times;2.0</option>
            <option value={3}>Triple time — &times;3.0</option>
          </select>
          {/* Auto-derived from End time above, see the useEffect — not
              directly editable, just needs to be part of the form data
              the schema validates and onNext() hands back up. */}
          <input
            type="hidden"
            {...register("overtimeAfterHours", { valueAsNumber: true })}
          />
          {(errors.overtimeAfterHours || errors.overtimeMultiplier) && (
            <p className="mt-1 text-sm text-alert">
              {errors.overtimeAfterHours?.message ??
                errors.overtimeMultiplier?.message}
            </p>
          )}
        </div>
      </div>

      <p className="text-xs text-neutral -mt-2">
        Hours worked after {endTime || "the end of the workday"} are paid at{" "}
        {overtimeMultiplier > 1
          ? `${overtimeMultiplier} times`
          : "the same as"}{" "}
        the normal hourly rate.
      </p>

      {/* The part clients usually ask next: "but we pay monthly". Every pay
          basis is turned into an hourly rate first, then the overtime rate
          is applied to that. Worked through with a salary they can change. */}
      <div className="rounded-md border border-neutral/20 bg-neutral/5 p-4 text-sm">
        <p className="font-medium text-heading">How overtime is calculated</p>
        <p className="mt-1 text-xs text-neutral">
          We export each person&apos;s hours, split by overtime rate, and your
          payroll tool turns them into pay. This example shows what it will do
          with them — nothing you type here is saved.
        </p>

        <label
          htmlFor="exampleSalary"
          className="mt-3 block text-xs font-medium text-heading"
        >
          Example monthly salary (₦)
        </label>
        <input
          id="exampleSalary"
          type="number"
          min={0}
          inputMode="numeric"
          value={exampleSalary}
          onChange={(event) => setExampleSalary(event.target.value)}
          className="mt-1 w-full sm:w-56 rounded-md border border-neutral/40 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />

        {example ? (
          <ol className="mt-3 space-y-1.5 text-neutral">
            <li>
              <span className="font-medium text-heading">1. Standard hours a month:</span>{" "}
              {dailyHours} h a day &times; {WORKING_DAYS_PER_MONTH} working days ={" "}
              {example.monthlyHours} h
            </li>
            <li>
              <span className="font-medium text-heading">2. Hourly rate:</span>{" "}
              {naira(Number(exampleSalary))} &divide; {example.monthlyHours} h ={" "}
              {naira(example.hourlyRate)} an hour
            </li>
            <li>
              <span className="font-medium text-heading">3. Overtime rate:</span>{" "}
              {naira(example.hourlyRate)} &times; {overtimeMultiplier} ={" "}
              {naira(example.overtimeRate)} an overtime hour
            </li>
            <li>
              <span className="font-medium text-heading">
                4. {EXAMPLE_OVERTIME_HOURS} hours of overtime:
              </span>{" "}
              {naira(example.overtimePay)}
            </li>
          </ol>
        ) : (
          <p className="mt-3 text-xs text-neutral">
            Enter a salary and set a start and end time to see the working.
          </p>
        )}

        <p className="mt-3 text-xs text-neutral">
          Staff who are paid hourly skip steps 1 and 2 — their own hourly rate
          is used directly. The example assumes {WORKING_DAYS_PER_MONTH} working
          days a month.
        </p>
      </div>

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
