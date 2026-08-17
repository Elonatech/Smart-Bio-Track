import { z } from "zod";

// One schema per wizard step. Each is validated independently when its
// own step's form is submitted (via zodResolver, same pattern as
// login/register) — NOT all six merged into one giant form.

export const orgProfileSchema = z.object({
  organizationName: z.string().min(2, { message: "Organization name is required" }),
  industry: z.string().min(2, { message: "Industry is required" }),
  timezone: z.string().default("WAT"),
});
export type OrgProfileValues = z.infer<typeof orgProfileSchema>;

export const officeSchema = z.object({
  officeName: z.string().min(2, { message: "Office name is required" }),
  address: z.string().min(5, { message: "Address is required" }),
  landmark: z.string().optional(),
  latitude: z.number(),
  longitude: z.number(),
  geofenceRadiusMeters: z.number().min(10).max(1000).default(100),
});
export type OfficeValues = z.infer<typeof officeSchema>;

export const workRulesSchema = z.object({
  startTime: z.string().min(1, { message: "Start time is required" }), // "08:00"
  endTime: z.string().min(1, { message: "End time is required" }),     // "17:00"
  gracePeriodMinutes: z.number().min(0).max(60).default(10),
  overtimeAfterHours: z.number().min(1).max(16).default(9),
});
export type WorkRulesValues = z.infer<typeof workRulesSchema>;

export const departmentsSchema = z.object({
  departments: z
    .array(z.object({ name: z.string().min(2, { message: "Department name required" }) }))
    .min(1, { message: "Add at least one department" }),
});
export type DepartmentsValues = z.infer<typeof departmentsSchema>;

export const inviteTeamSchema = z.object({
  invites: z.array(
    z.object({
      email: z.string().email({ message: "Enter a valid email" }),
      role: z.enum(["HR_ADMIN", "TEAM_LEAD"]),
    })
  ), // deliberately allowed to be empty — inviting people is optional at this step
});
export type InviteTeamValues = z.infer<typeof inviteTeamSchema>;

// The full payload sent to the backend once the wizard finishes.
// Combines every step's data into one shape.
export interface OnboardingPayload {
  orgProfile: OrgProfileValues;
  office: OfficeValues;
  workRules: WorkRulesValues;
  departments: DepartmentsValues;
  inviteTeam: InviteTeamValues;
}
