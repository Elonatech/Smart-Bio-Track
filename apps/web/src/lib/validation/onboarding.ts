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
  // Real latitude/longitude bounds, not an arbitrary restriction — see
  // OfficeFormModal.tsx's identical fields for why these were added: the
  // map picker actually pans to whatever is typed here, so an out-of-range
  // value used to sit unnoticed in a text box and now renders a blank,
  // nowhere view instead.
  latitude: z
    .number()
    .min(-90, { message: "Latitude must be between -90 and 90" })
    .max(90, { message: "Latitude must be between -90 and 90" }),
  longitude: z
    .number()
    .min(-180, { message: "Longitude must be between -180 and 180" })
    .max(180, { message: "Longitude must be between -180 and 180" }),
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
    z
      .object({
        name: z.string().min(2, { message: "Name is required" }),
        email: z.string().email({ message: "Enter a valid email" }),
        role: z.enum(["HR_ADMIN", "TEAM_LEAD", "EMPLOYEE"]),
        // The department NAME, not an id: departments are only created
        // when the wizard finishes, so no id exists while this form is
        // being filled in. onboarding/page.tsx maps name -> id after
        // POST /departments and before POST /users.
        department: z.string().optional(),
        // UI-only, like Time Regulation: CreateUserDto and the User model
        // have no salary column, so this is collected but never sent to
        // POST /users. Kept as a string so the field accepts free-form
        // input (currency symbols, "negotiable", etc.) without a parser.
        salary: z.string().optional(),
      })
      .superRefine((invite, ctx) => {
        // A Team Lead with no department is a broken account, not merely
        // an incomplete one: every Team Lead page is scoped to a
        // department, and there is no PATCH /users/:id to set it later.
        // Employees and HR Admins are org-wide, so theirs stays optional.
        if (invite.role === "TEAM_LEAD" && !invite.department) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["department"],
            message: "A Team Lead must be assigned a department",
          });
        }
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
