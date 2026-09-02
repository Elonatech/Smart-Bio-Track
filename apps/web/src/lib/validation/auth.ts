import { z } from "zod";

// Matches @smartbiotrack/constants' PASSWORD_REGEX exactly (packages/constants/index.ts)
// — must contain lowercase, uppercase, a digit, and a special character.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
const PASSWORD_MESSAGE =
  "Must be 8+ characters and include an uppercase letter, a lowercase letter, a number, and a special character.";

export const loginSchema = z.object({
  // Backend's LoginDto now accepts a single `identifier` field — either
  // an email or an Employee ID, distinguished server-side by whether it
  // contains an "@" (see apps/api/src/auth/dto/login.dto.ts). No format
  // validation here beyond "not empty", since a valid Employee ID
  // wouldn't pass an email-shape check.
  identifier: z.string().min(1, { message: "Employee ID or email is required" }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters " }),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

// Org signup is TWO steps on the backend:
//
//   1. POST /auth/register-organization  { email, password }
//      -> stores a PendingOrganizationSignup row and emails a link.
//         Returns a message only — no tokens, nothing to log in with.
//   2. POST /auth/verify-organization    { token, organizationName,
//                                          adminName, industry }
//      -> redeems the token, creates the real Organization + its
//         SUPER_ADMIN, and returns the token pair.
//
// So this schema covers step one only. It deliberately does NOT collect
// an employee ID any more: the backend generates the admin's itself
// (see apps/api/src/common/employee-id.util.ts, e.g. "ADM-7K2X9").
//
// confirmPassword is client-side only — CreatePendingOrganizationDto
// takes just email and password, so it's stripped before the request.
export const registerSchema = z
  .object({
    email: z.string().email({ message: "Enter a valid email address" }),
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 characters" })
      .regex(PASSWORD_REGEX, { message: PASSWORD_MESSAGE }),
    confirmPassword: z
      .string()
      .min(8, { message: "Password must be at least 8 characters" })
      .regex(PASSWORD_REGEX, { message: PASSWORD_MESSAGE }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;

// Step two. Matches VerifyOrganizationDto exactly (apps/api/src/auth/
// dto/verify-organization.dto.ts). `token` isn't here — it comes from
// the emailed link's query string rather than being typed, same as the
// activation flow.
export const verifyOrganizationSchema = z.object({
  organizationName: z
    .string()
    .min(3, { message: "Organization name must be at least 3 characters" }),
  adminName: z.string().min(2, { message: "Your full name is required" }),
  industry: z.string().min(1, { message: "Industry is required" }),
});

export type VerifyOrganizationFormValues = z.infer<
  typeof verifyOrganizationSchema
>;

export const forgotPasswordSchema = z.object({
  email: z.string().email({ message: "Enter a valid email address" }),
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

// Matches CompleteRegistrationDto exactly (apps/api/src/auth/dto/
// complete-registration.dto.ts) — token comes from the activation
// link's query string, not typed by the user, so it's not part of
// this form's own fields (see activate/page.tsx).
export const activateAccountSchema = z
  .object({
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 characters" })
      .regex(PASSWORD_REGEX, { message: PASSWORD_MESSAGE }),
    confirmPassword: z
      .string()
      .min(8, { message: "Password must be at least 8 characters" })
      .regex(PASSWORD_REGEX, { message: PASSWORD_MESSAGE }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export type ActivateAccountFormValues = z.infer<typeof activateAccountSchema>;
