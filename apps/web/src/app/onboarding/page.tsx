"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { appClient } from "@/lib/api-client";
import { PartyPopper } from "lucide-react";
import { StepProgress } from "@/app/components/onboarding/StepProgress";
import { StepOrgProfile } from "@/app/components/onboarding/StepOrgProfile";
import { StepOffice } from "@/app/components/onboarding/StepOffice";
import type {
  OrgProfileValues,
  OfficeValues,
  OnboardingPayload,
  WorkRulesValues,
  DepartmentsValues,
  InviteTeamValues,
} from "@/lib/validation/onboarding";
import StepWorkRules from "@/app/components/onboarding/StepWorkRules";
import StepDepartments from "@/app/components/onboarding/StepDepartments";
import StepInviteTeam from "@/app/components/onboarding/StepInviteTeam";

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
  //
  // TEMPORARY: the real POST /organizations/setup endpoint doesn't
  // exist on the backend yet (only /auth/register-organization,
  // /offices, /departments exist individually, nothing accepts this
  // wizard's combined payload, and work rules/invites have no endpoint
  // at all). Skipping the network call for now so the UI flow can be
  // built/reviewed independently of backend work — re-enable the
  // commented-out block once the backend side is ready, and remove
  // this comment.
  async function handleFinish() {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      // await appClient.post("/organizations/setup", payload);
      const orgName = payload.orgProfile?.organizationName ?? "";
      router.push(`/onboarding/welcome?org=${encodeURIComponent(orgName)}`);
    } catch {
      setSubmitError(
        "Something went wrong setting up your workspace. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-4xl bg-surface rounded-xl border border-neutral/20 p-4 sm:p-8">
        <p className="text-xs font-medium tracking-wide text-neutral uppercase mb-1">
          Org Super Admin · First Login
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-heading mb-6">
          Set up your workspace
        </h1>

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
          <StepOffice
            defaultValues={payload.office}
            onNext={(values: OfficeValues) =>
              handleStepComplete("office", values)
            }
            onBack={handleBack}
          />
        )}

        {currentStep === 3 && (
          <StepWorkRules
            defaultValues={payload.workRules}
            onNext={(values: WorkRulesValues) =>
              handleStepComplete("workRules", values)
            }
            onBack={handleBack}
          />
        )}

        {currentStep === 4 && (
          <StepDepartments
            defaultValues={payload.departments}
            onNext={(values: DepartmentsValues) =>
              handleStepComplete("departments", values)
            }
            onBack={handleBack}
          />
        )}

        {currentStep === 5 && (
          <StepInviteTeam
            defaultValues={payload.inviteTeam}
            onNext={(values: InviteTeamValues) =>
              handleStepComplete("inviteTeam", values)
            }
            onBack={handleBack}
          />
        )}

        {currentStep === 6 && (
          <div className="flex flex-col items-center text-center py-4">
            <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
              <PartyPopper className="h-7 w-7 text-success" strokeWidth={1.75} />
            </div>
            <h2 className="text-lg font-semibold text-heading mb-1">
              Your workspace is ready
            </h2>
            <p className="text-sm text-neutral mb-6">
              {payload.orgProfile?.organizationName ?? "Your organization"} is
              configured with 1 office, {payload.departments?.departments.length ?? 0}{" "}
              {payload.departments?.departments.length === 1 ? "department" : "departments"} and{" "}
              {payload.inviteTeam?.invites.length ?? 0} pending{" "}
              {payload.inviteTeam?.invites.length === 1 ? "invite" : "invites"}.
            </p>
            <button
              type="button"
              onClick={handleFinish}
              disabled={isSubmitting}
              className="rounded-md bg-primary text-white px-6 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
            >
              {isSubmitting ? "Setting up..." : "Finish setup"}
            </button>  
          </div>
        )}
      </div>
    </div>
  );
}
