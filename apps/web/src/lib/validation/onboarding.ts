import { z } from "zod";

// One schema per wizard step. Each is validated independently when its
// own step's form is submitted (via zodResolver, same pattern as
// login/register) — NOT all six merged into one giant form.

// NOTE: deliberately no `.default()` on any field below. zodResolver
// treats a `.default()`'d field as optional on the *input* type but
// required on the *output* type, which conflicts with react-hook-form's
// single FieldValues generic and throws a TS2322/TS2345 mismatch (hit
// this with geofenceRadiusMeters — see StepOffice.tsx history). Instead,
// each field is a plain required schema, and the step component supplies
// its own default via useForm's `defaultValues` (already the pattern
// every step component follows).

export const orgProfileSchema = z.object({
  organizationName: z.string().min(2, { message: "Organization name is required" }),
  industry: z.string().min(2, { message: "Industry is required" }),
  timezone: z.string(),
});
export type OrgProfileValues = z.infer<typeof orgProfileSchema>;

export const officeSchema = z.object({
  officeName: z.string().min(2, { message: "Office name is required" }),
  address: z.string().min(5, { message: "Address is required" }),
  landmark: z.string().optional(),
  latitude: z.number(),
  longitude: z.number(),
  geofenceRadiusMeters: z.number().min(10).max(1000),
});
export type OfficeValues = z.infer<typeof officeSchema>;

export const workRulesSchema = z.object({
  startTime: z.string().min(1, { message: "Start time is required" }), // "08:00"
  endTime: z.string().min(1, { message: "End time is required" }),     // "17:00"
  gracePeriodMinutes: z.number().min(0).max(60),
  // The clock hour (0-23) overtime starts at — auto-derived from
  // endTime in the UI, not a separately user-picked "hours worked"
  // count. See StepWorkRules.tsx.
  overtimeAfterHours: z.number().min(0).max(23),
  // Pay rate multiplier applied once overtimeAfterHours is exceeded,
  // e.g. 1.5 = "time and a half". 1 = no extra pay, just tracked hours.
  overtimeMultiplier: z.number().min(1).max(3),
});
export type WorkRulesValues = z.infer<typeof workRulesSchema>;

export const departmentsSchema = z.object({
  departments: z
    .array(z.object({ name: z.string().min(2, { message: "Department name required" }) }))
    .min(1, { message: "Add at least one department" }),
});
export type DepartmentsValues = z.infer<typeof departmentsSchema>;

// Matches CreateUserDto (apps/api/src/users/dto/create-users.dto.ts).
//
// No employeeId field: the server generates one, prefixed by role —
// HR-7K2X9, TL-…, EMP-… — via generateUniqueEmployeeId() in
// common/employee-id.util.ts. It's globally unique, so only the server
// can safely mint it; a browser can't see other organizations' IDs.
//
// The DTO still accepts an employeeId if one is sent, for organizations
// migrating from an existing HR system. This form doesn't offer that.
export const inviteTeamSchema = z.object({
  invites: z.array(
    z.object({
      name: z.string().min(2, { message: "Name is required" }),
      email: z.string().email({ message: "Enter a valid email" }),
      role: z.enum(["HR_ADMIN", "TEAM_LEAD", "EMPLOYEE"]),
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
