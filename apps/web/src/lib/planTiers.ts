// Plan-gating for dashboard features. UI only — there is no `plan`
// column on Organization in prisma/schema.prisma, so CURRENT_PLAN below
// is a mock rather than something read from the signed-in user's real
// organization. Swap it for a real value (from the user/org record) the
// day billing actually tracks a plan.

export type PlanTier = "STARTER" | "CORE" | "ELITE" | "ENTERPRISE";


const PLAN_ORDER: PlanTier[] = ["STARTER", "CORE", "ELITE", "ENTERPRISE"];

export const PLAN_LABEL: Record<PlanTier, string> = {
  STARTER: "Starter",
  CORE: "Core",
  ELITE: "Elite",
  ENTERPRISE: "Enterprise",
};


export const CURRENT_PLAN: PlanTier = "STARTER";

export function isPlanUnlocked(required: PlanTier, current: PlanTier): boolean {
  return PLAN_ORDER.indexOf(current) >= PLAN_ORDER.indexOf(required);
}
