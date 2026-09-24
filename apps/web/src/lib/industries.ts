// One list, shared by the org-creation form (verify-organization/page.tsx)
// and the onboarding wizard's organization-profile step
// (StepOrgProfile.tsx). Before this file existed the two had separately
// hand-typed lists that had already drifted ("Financial Services" vs
// "Finance", "Technology & Software" vs "Technology Services", and a few
// entries only one of the two had) — harmless on their own, since each
// page only ever reads its own list, but it meant an industry picked on
// one screen couldn't be recognised as a valid option on the other, which
// matters the moment one screen tries to hand its value to the next (see
// the onboarding-industry hint in verify-organization/page.tsx).

export const INDUSTRIES = [
  "Financial Services",
  "Technology & Software",
  "Telecommunications",
  "Oil & Gas",
  "Manufacturing",
  "Healthcare",
  "Education",
  "Retail & E-commerce",
  "Logistics & Transport",
  "Construction & Real Estate",
  "Hospitality",
  "Public Sector",
  "Other",
] as const;

export type Industry = (typeof INDUSTRIES)[number];
