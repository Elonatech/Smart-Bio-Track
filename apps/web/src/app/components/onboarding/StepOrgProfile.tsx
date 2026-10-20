import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { orgProfileSchema, type OrgProfileValues } from "@/lib/validation/onboarding";
import { INDUSTRIES } from "@/lib/industries";
import { DEFAULT_TIMEZONE, TIMEZONES, normalizeTimezone } from "@/lib/organization";

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
  onBack?: () => void;
}

export function StepOrgProfile({ defaultValues, onNext, onBack }: StepOrgProfileProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OrgProfileValues>({
    resolver: zodResolver(orgProfileSchema),
    defaultValues: {
      ...defaultValues,
      // normalizeTimezone: saved progress from before this change may
      // still hold "WAT", which the API refuses.
      timezone: normalizeTimezone(defaultValues?.timezone ?? DEFAULT_TIMEZONE),
    },
  });

  // Editable now that there's somewhere to send them: handleFinish saves
  // name, industry and timezone with PATCH /organization. (Until Phase 3
  // these were shown locked, because there was no endpoint and an edit
  // here silently changed nothing.) Prefilled from signup, so most people
  // just continue.
  //
  // An industry saved at signup that isn't in today's list stays
  // selectable, so prefilling never silently blanks it.
  const savedIndustry = defaultValues?.industry ?? "";
  const industryOptions =
    savedIndustry && !(INDUSTRIES as readonly string[]).includes(savedIndustry)
      ? [savedIndustry, ...INDUSTRIES]
      : INDUSTRIES;

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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="logo"
            className="block text-sm font-medium text-heading mb-1"
          >
            Logo
          </label>
          <label
            htmlFor="logo"
            className="flex items-center justify-center gap-2 w-full rounded-md border border-dashed border-neutral/40 px-3 py-2 text-sm text-neutral cursor-pointer hover:border-primary hover:text-primary"
          >
            <span aria-hidden>&#8593;</span>
            Upload PNG or SVG
            <input id="logo" type="file" accept="image/png,image/svg+xml" className="hidden" />
          </label>
        </div>

        <div>
          <label
            htmlFor="industry"
            className="block text-sm font-medium text-heading mb-1"
          >
            Industry
          </label>
          <select
            id="industry"
            {...register("industry")}
            className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="" disabled>
              Select industry
            </option>
            {industryOptions.map((industry) => (
              <option key={industry} value={industry}>
                {industry}
              </option>
            ))}
          </select>
          {errors.industry && (
            <p className="mt-1 text-sm text-alert">{errors.industry.message}</p>
          )}
        </div>
      </div>

      <div>
        <label
          htmlFor="timezone"
          className="block text-sm font-medium text-heading mb-1"
        >
          Timezone
        </label>
        <select
          id="timezone"
          {...register("timezone")}
          className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {/* IANA values only — see TIMEZONES in lib/organization.ts. */}
          {TIMEZONES.map((zone) => (
            <option key={zone.value} value={zone.value}>
              {zone.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-neutral">
          Decides which day each clock-in belongs to, and what &ldquo;08:00&rdquo; means for lateness.
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
}
