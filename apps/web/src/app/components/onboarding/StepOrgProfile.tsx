import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock } from "lucide-react";
import { orgProfileSchema, type OrgProfileValues } from "@/lib/validation/onboarding";
import { INDUSTRIES } from "@/lib/industries";

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
      timezone: "WAT",
      ...defaultValues,
    },
  });

  // Both were already collected for real at signup (verify-organization
  // requires them) and the Organization row was created with them then.
  // This step used to let you retype either one — which looked like an
  // edit, updated nothing, and reappeared as the ORIGINAL value the moment
  // you left and came back, because onboarding/page.tsx's handleFinish has
  // nowhere to send an org-profile change: there is no PATCH /organizations
  // endpoint yet, only POST /auth/verify-organization, which only ever
  // runs once. Shown read-only with that explained, instead of an
  // editable-looking field whose edits silently evaporate.
  //
  // Locked ONLY when there's a real value to show. A signup that somehow
  // reached this step with one blank (a pre-existing org from before
  // industry was required, a seed script, bad data) must still be able to
  // TYPE one in — both are required by the schema below, and a locked
  // empty field can never satisfy that, which would strand that account
  // on step 1 of its own wizard with no way to continue and no visible
  // reason why.
  const readOnlyOrgName = defaultValues?.organizationName ?? "";
  const readOnlyIndustry = defaultValues?.industry ?? "";
  const isOrgNameLocked = readOnlyOrgName.trim().length > 0;
  const isIndustryLocked = readOnlyIndustry.trim().length > 0;

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
        {isOrgNameLocked ? (
          <>
            <div
              id="organizationName"
              className="flex items-center justify-between gap-2 w-full rounded-md border border-neutral/40 bg-neutral/5 px-3 py-2 text-sm text-heading"
            >
              <span>{readOnlyOrgName}</span>
              <Lock className="h-3.5 w-3.5 shrink-0 text-neutral" strokeWidth={2} />
            </div>
            {/* Carries the real value through to onNext(values) —
                nothing here is user-editable, so there's nothing for a
                visible input to register against. */}
            <input type="hidden" {...register("organizationName")} />
            <p className="mt-1 text-xs text-neutral">
              Set when your workspace was created — renaming isn&apos;t
              available yet.
            </p>
          </>
        ) : (
          <input
            id="organizationName"
            type="text"
            {...register("organizationName")}
            className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        )}
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
          {isIndustryLocked ? (
            <>
              <div
                id="industry"
                className="flex items-center justify-between gap-2 w-full rounded-md border border-neutral/40 bg-neutral/5 px-3 py-2 text-sm text-heading"
              >
                <span>{readOnlyIndustry}</span>
                <Lock className="h-3.5 w-3.5 shrink-0 text-neutral" strokeWidth={2} />
              </div>
              <input type="hidden" {...register("industry")} />
              <p className="mt-1 text-xs text-neutral">Also set at signup.</p>
            </>
          ) : (
            <select
              id="industry"
              {...register("industry")}
              defaultValue=""
              className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="" disabled>
                Select industry
              </option>
              {INDUSTRIES.map((industry) => (
                <option key={industry} value={industry}>
                  {industry}
                </option>
              ))}
            </select>
          )}
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
          <option value="WAT">(GMT+1) West Africa Time — WAT</option>
        </select>
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
