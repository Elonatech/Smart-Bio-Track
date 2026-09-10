"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { appClient, extractErrorMessage } from "@/lib/api-client";
import { useToast } from "@/app/components/Toast";
import { getDashboardPath } from "@/lib/roleRoutes";
import { useAuthStore } from "@/lib/store/auth-store";
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

// Wizard progress is saved per user so "Continue setup" resumes where
// you stopped instead of restarting at step 1. Keyed by user id because
// this is a shared browser in plenty of small offices — signing in as
// someone else must not inherit their half-finished setup.
//
// localStorage rather than sessionStorage: the gap between abandoning
// setup and coming back is often days, not minutes.
function getProgressKey(userId: string) {
  return `onboarding-progress:${userId}`;
}

interface SavedProgress {
  currentStep: number;
  payload: Partial<OnboardingPayload>;
}

export default function OnboardingPage() {
  const toast = useToast();
  const router = useRouter();
  const userId = useAuthStore((state) => state.user?.id);
  const hasRestored = useAuthStore((state) => state.hasRestored);

  // Gates both restoring and saving. Without it the save effect fires on
  // first render with the empty initial state and wipes the very
  // progress we're about to read back.
  const [isRestored, setIsRestored] = useState(false);

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

  // Setup is done at this point, so drop the saved progress — a later
  // visit should start clean, not replay a finished wizard.
  function goToWelcome() {
    if (userId) {
      try {
        localStorage.removeItem(getProgressKey(userId));
      } catch {
        // A stale key is harmless.
      }
    }
    const orgName = payload.orgProfile?.organizationName ?? "";
    router.push(`/onboarding/welcome?org=${encodeURIComponent(orgName)}`);
  }

  // Restore once the auth store has settled, so we know whose progress
  // to look for.
  useEffect(() => {
    if (!hasRestored) return;

    if (userId) {
      try {
        const raw = localStorage.getItem(getProgressKey(userId));
        if (raw) {
          const saved = JSON.parse(raw) as SavedProgress;
          setPayload(saved.payload ?? {});
          // Clamp: a saved step from an older build with a different
          // number of steps shouldn't strand someone on a blank screen.
          setCurrentStep(Math.min(Math.max(saved.currentStep ?? 1, 1), 6));
        }
      } catch {
        // Corrupt or unreadable — start fresh rather than crash.
      }
    }

    setIsRestored(true);
  }, [hasRestored, userId]);

  // Save on every change, so progress survives a closed tab, not just an
  // in-app navigation.
  useEffect(() => {
    if (!isRestored || !userId) return;
    try {
      localStorage.setItem(
        getProgressKey(userId),
        JSON.stringify({ currentStep, payload } satisfies SavedProgress)
      );
    } catch {
      // Storage full or blocked — the wizard still works, it just won't
      // resume.
    }
  }, [isRestored, userId, currentStep, payload]);

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

  // Advances WITHOUT writing anything into `payload`, so a skipped step
  // sends nothing to the API in handleFinish. Distinct from onNext,
  // which records the step's values first.
  function handleSkipStep() {
    setCurrentStep((step) => step + 1);
  }

  // Leaves setup entirely. Goes to the dashboard rather than the welcome
  // screen, because "Your workspace is live" would be a lie about an org
  // with no office, no departments and no team.
  //
  // Nothing is lost by leaving: the dashboard shows a banner back to
  // this wizard for as long as the org has no offices (see
  // SetupReminderBanner).
  function handleSkipSetup() {
    router.push(getDashboardPath("SUPER_ADMIN"));
  }

  // Called only from the final step (step 6's confirmation screen).
  //
  // There is no single POST /organizations/setup that takes this whole
  // payload — this used to call one and it never existed, so the wizard
  // collected six steps of data and threw all of it away. Now each part
  // goes to the endpoint that actually exists:
  //
  //   office       -> POST /offices       (real)
  //   departments  -> POST /departments   (real, one call each)
  //   orgProfile   -> nowhere. The Organization was already created at
  //                   /verify-organization, and there's no PATCH
  //                   /organizations to rename it or set a logo.
  //   workRules    -> nowhere. No WorkRule model or module exists.
  //   inviteTeam   -> POST /users        (real, one call each)
  //
  // Requests run in sequence rather than Promise.all so a failure points
  // at the thing that failed instead of a race of unrelated errors.
  async function handleFinish() {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      // MUST be idempotent. There's no transaction spanning these calls,
      // so any failure part-way leaves some records created — and office
      // names, department names and emails are all unique. Without this,
      // a retry after a partial failure fails forever on "already
      // exists", with no way to move forward or back.
      //
      // So: read what's already there, and only create what's missing.
      const [existingOffices, existingDepartments, existingUsers] =
        await Promise.all([
          appClient
            .get<{ name: string }[]>("/offices")
            .catch(() => ({ data: [] as { name: string }[] })),
          appClient
            .get<{ name: string }[]>("/departments")
            .catch(() => ({ data: [] as { name: string }[] })),
          appClient
            .get<{ email: string }[]>("/users")
            .catch(() => ({ data: [] as { email: string }[] })),
        ]);

      const officeNames = new Set(
        existingOffices.data.map((o) => o.name.trim().toLowerCase())
      );
      const departmentNames = new Set(
        existingDepartments.data.map((d) => d.name.trim().toLowerCase())
      );
      const userEmails = new Set(
        existingUsers.data.map((u) => u.email.trim().toLowerCase())
      );

      if (
        payload.office &&
        !officeNames.has(payload.office.officeName.trim().toLowerCase())
      ) {
        // `address` and `landmark` are collected by the step but
        // CreateOfficeDto has no columns for them, so they're dropped
        // here rather than silently rejected by the API.
        await appClient.post("/offices", {
          name: payload.office.officeName,
          latitude: payload.office.latitude,
          longitude: payload.office.longitude,
          geofenceRadiusMeters: payload.office.geofenceRadiusMeters,
        });
      }

      for (const department of payload.departments?.departments ?? []) {
        if (departmentNames.has(department.name.trim().toLowerCase())) continue;
        await appClient.post("/departments", { name: department.name });
      }

      // Same endpoint the Add person modal uses. Each creates a PENDING
      // user, and provision() now emails them the activation link itself
      // (users.service.ts calls sendActivationEmail). Nothing comes back
      // to display: the token is stored only as a hash, so this page no
      // longer has to hold the admin here to hand links out.
      let invitedCount = 0;
      for (const invite of payload.inviteTeam?.invites ?? []) {
        if (userEmails.has(invite.email.trim().toLowerCase())) continue;
        await appClient.post("/users", {
          name: invite.name,
          email: invite.email,
          role: invite.role,
        });
        invitedCount += 1;
      }

      toast.success(
        "Workspace set up successfully",
        invitedCount > 0
          ? `Your office and departments are saved, and ${invitedCount} activation ${
              invitedCount === 1 ? "email has" : "emails have"
            } been sent.`
          : "Your office and departments have been saved."
      );

      goToWelcome();
    } catch (error) {
      const message = extractErrorMessage(error);
      setSubmitError(message);
      toast.error("Setup could not finish", message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Saved progress is read in an effect, so the first render always has
  // the empty initial state. Rendering it would flash step 1 before
  // jumping to the restored step.
  if (!isRestored) return null;

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

        {/* Setup is optional — nothing in the schema requires an office,
            a department or a single colleague (departmentId and officeId
            are both nullable on User). Offering the exits explicitly
            beats the old behaviour, where the only way out was closing
            the tab, which then made the wizard unreachable forever.
            Hidden on step 6, which is the confirmation, not a form. */}
        {currentStep < 6 && (
          <div className="flex flex-wrap items-center justify-between gap-3 mt-6 pt-4 border-t border-neutral/20">
            <button
              type="button"
              onClick={handleSkipStep}
              className="text-sm font-medium text-neutral hover:text-heading"
            >
              Skip this step
            </button>
            <button
              type="button"
              onClick={handleSkipSetup}
              className="text-sm font-medium text-neutral hover:text-heading"
            >
              Skip setup and go to dashboard &rarr;
            </button>
          </div>
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

            {/* Step 6 previously had ONLY "Finish setup", so an error
                here — a duplicate office name, say — left you stuck with
                no way to correct it and no way out. */}
            <div className="flex flex-wrap items-center justify-center gap-4 mt-6 pt-4 border-t border-neutral/20 w-full">
              <button
                type="button"
                onClick={handleBack}
                disabled={isSubmitting}
                className="text-sm font-medium text-neutral hover:text-heading disabled:opacity-40"
              >
                &larr; Back
              </button>
              <button
                type="button"
                onClick={handleSkipSetup}
                disabled={isSubmitting}
                className="text-sm font-medium text-neutral hover:text-heading disabled:opacity-40"
              >
                Skip setup and go to dashboard &rarr;
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
