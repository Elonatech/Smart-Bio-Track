"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { appClient } from "@/lib/api-client";
import { StepProgress } from "@/app/components/onboarding/StepProgress";
import { StepOrgProfile } from "@/app/components/onboarding/StepOrgProfile";
import type {
  OrgProfileValues,
  OnboardingPayload,
} from "@/lib/validation/onboarding";
// TODO: as you build each remaining step component, add its values
// type here too, e.g. `import type { OfficeValues } from "..."` —
// you'll need it for that step's onNext callback's parameter type,
// same as OrgProfileValues is used below.

// TODO: import your remaining step components as you build them, e.g.:
// import { StepOffice } from "@/app/components/onboarding/StepOffice";
// import { StepWorkRules } from "@/app/components/onboarding/StepWorkRules";
// import { StepDepartments } from "@/app/components/onboarding/StepDepartments";
// import { StepInviteTeam } from "@/app/components/onboarding/StepInviteTeam";

export default function OnboardingPage() {
  const router = useRouter();

  // 1-indexed to match StepProgress and the spec's "Step 1 of 6"
  // framing. Going "back" is just decrementing this; going forward is
  // incrementing it — no routing involved, which is why back/forward
  // never loses data (see below).
  const [currentStep, setCurrentStep] = useState(1);

  // Accumulates every step's validated data as the user moves forward.
  // It's a Partial<OnboardingPayload> because, until step 6, most of
  // these keys are still undefined — TypeScript makes us handle that
  // explicitly rather than pretending the data exists before it does.
  const [payload, setPayload] = useState<Partial<OnboardingPayload>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Called by a step's onNext. Merges that step's data into the
  // accumulated payload under the given key, then advances the step.
  // This is the ONE function every step ultimately calls — it's what
  // keeps all six steps consistent instead of each reinventing how
  // "move to the next step" works.
  function handleStepComplete<K extends keyof OnboardingPayload>(
    key: K,
    values: OnboardingPayload[K]
  ) {
    setPayload((prev) => ({ ...prev, [key]: values }));
    setCurrentStep((step) => step + 1);
  }

  function handleBack() {
    setCurrentStep((step) => Math.max(1, step - 1));
  }

  // Called only from the final step (step 6's confirmation screen).
  // This is the one and only network call in the whole wizard — every
  // earlier step just accumulates data locally, nothing is persisted
  // to the backend until the user has seen and confirmed everything.
  async function handleFinish() {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await appClient.post("/organizations/setup", payload);
      router.push("/onboarding/welcome"); // the org welcome/landing screen from earlier
    } catch {
      setSubmitError(
        "Something went wrong setting up your workspace. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="w-full max-w-lg bg-surface rounded-xl border border-neutral/20 p-8">
        <StepProgress currentStep={currentStep} />

        {submitError && (
          <div className="mb-4 rounded-md bg-alert/10 border border-alert/30 text-alert text-sm px-3 py-2">
            {submitError}
          </div>
        )}

        {/* Only one step is ever rendered at a time. Each branch below
            passes `defaultValues={payload.X}` so navigating back to an
            already-completed step shows what was previously entered,
            instead of a blank form. */}

        {currentStep === 1 && (
          <StepOrgProfile
            defaultValues={payload.orgProfile}
            onNext={(values: OrgProfileValues) =>
              handleStepComplete("orgProfile", values)
            }
          />
        )}

        {/* TODO: replace each block below with the real step component
            once you've built it, following the exact same shape as
            step 1 above: defaultValues={payload.X}, onNext calls
            handleStepComplete("X", values), and (unlike step 1) an
            onBack={handleBack} prop too, since these steps DO have
            something to go back to. */}

        {currentStep === 2 && (
          <div className="text-sm text-neutral">
            TODO: StepOffice — office name, address, landmark, geo-fence
            radius. onNext={"->"} handleStepComplete(&quot;office&quot;, values)
          </div>
        )}

        {currentStep === 3 && (
          <div className="text-sm text-neutral">
            TODO: StepWorkRules — start/end time, grace period, overtime.
          </div>
        )}

        {currentStep === 4 && (
          <div className="text-sm text-neutral">
            TODO: StepDepartments — repeatable list of department names.
          </div>
        )}

        {currentStep === 5 && (
          <div className="text-sm text-neutral">
            TODO: StepInviteTeam — repeatable list of {"{ email, role }"}.
          </div>
        )}

        {currentStep === 6 && (
          <div className="space-y-4">
            <p className="text-sm text-neutral">
              Review complete. Click below to create your workspace.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleBack}
                className="flex-1 rounded-md border border-neutral/40 py-2 text-sm font-medium text-heading hover:bg-neutral/10"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleFinish}
                disabled={isSubmitting}
                className="flex-1 rounded-md bg-primary text-white py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
              >
                {isSubmitting ? "Setting up..." : "Finish setup"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
