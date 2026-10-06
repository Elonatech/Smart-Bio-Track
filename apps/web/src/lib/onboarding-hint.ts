// Carries the industry picked on the org-creation form
// (verify-organization/page.tsx) forward to the onboarding wizard's own
// "organization profile" step, so that field doesn't ask the same person
// the same question twice in one continuous flow.
//
// Only industry needs this. The organization name doesn't: it's already
// on the signed-in user via `AuthUser.organizationName` (see
// auth-store.ts), set the moment verify-organization logs someone in, so
// the onboarding wizard can read it straight from the auth store. Industry
// has no such home — it's Organization data with no field on AuthUser and
// no GET /auth/me key for it (see packages/types' ME_RESPONSE_KEYS) — so it
// needs a way to travel from one page to the next that isn't "add a field
// to the session that the server never actually sends," which is exactly
// the trap MeResponse's own comment warns against.
//
// sessionStorage, read once and deleted immediately: this is a hint for
// ONE specific navigation, not state. If the onboarding wizard is ever
// re-opened later in the same tab (someone leaves and comes back to
// "Continue setup"), it must NOT re-apply a five-minutes-old industry
// value over whatever the user may since have typed and saved — deleting
// it the moment it's read is what guarantees that.
const KEY = "onboarding-industry-hint";

export function setOnboardingIndustryHint(industry: string): void {
  try {
    sessionStorage.setItem(KEY, industry);
  } catch {
    // No hint, no prefill — the field just starts blank, same as today.
  }
}

/** Reads and clears in one call — see the file comment for why. */
export function consumeOnboardingIndustryHint(): string | null {
  try {
    const value = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return value;
  } catch {
    return null;
  }
}
