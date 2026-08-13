import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { orgProfileSchema, type OrgProfileValues } from "@/lib/validation/onboarding";

// Every step component follows this same contract:
// - `defaultValues`: whatever was entered last time (so clicking "Back"
//   then forward again doesn't lose data — this is where that
//   requirement from the spec actually gets satisfied).
// - `onNext`: called with this step's validated data when the user
//   submits. The parent page decides what happens after that
//   (advance currentStep, merge into the accumulated payload).
// There's no `onBack` here since this is step 1 — every other step
// will also receive an `onBack: () => void` prop.
interface StepOrgProfileProps {
  defaultValues?: Partial<OrgProfileValues>;
  onNext: (values: OrgProfileValues) => void;
}

export function StepOrgProfile({ defaultValues, onNext }: StepOrgProfileProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OrgProfileValues>({
    resolver: zodResolver(orgProfileSchema),
    defaultValues: {
      timezone: "WAT",
      ...defaultValues,
    },
  });

  // Note: no try/catch or API call here. Unlike login/register, this
  // step doesn't hit the backend on its own — it just hands validated
  // data up to the parent wizard, which submits everything together
  // at the very end (step 6). Every step component follows this same
  // "no API calls, just onNext(values)" rule.
  const onSubmit = (values: OrgProfileValues) => {
    onNext(values);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label
          htmlFor="organizationName"
          className="block text-sm font-medium text-heading mb-1"
        >
          Organization name
        </label>
        <input
          id="organizationName"
          type="text"
          {...register("organizationName")}
          className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {errors.organizationName && (
          <p className="mt-1 text-sm text-alert">
            {errors.organizationName.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="industry"
          className="block text-sm font-medium text-heading mb-1"
        >
          Industry
        </label>
        <input
          id="industry"
          type="text"
          placeholder="e.g. Retail, Healthcare, Manufacturing"
          {...register("industry")}
          className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {errors.industry && (
          <p className="mt-1 text-sm text-alert">{errors.industry.message}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="timezone"
          className="block text-sm font-medium text-heading mb-1"
        >
          Timezone
        </label>
        <input
          id="timezone"
          type="text"
          disabled
          {...register("timezone")}
          className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm bg-neutral/10 text-neutral"
        />
      </div>

      {/* Step 1 has no "Back" button — nothing to go back to. Every
          other step will have Back + Next side by side here. */}
      <button
        type="submit"
        className="w-full rounded-md bg-primary text-white py-2 text-sm font-medium hover:bg-primary/90"
      >
        Continue
      </button>
    </form>
  );
}
