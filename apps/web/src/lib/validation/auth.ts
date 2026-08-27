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

export const registerSchema = z
  .object({
    organizationName: z
      .string()
      .min(3, { message: "Organization Name is required" }),
    adminEmployeeId: z
      .string()
      .min(2, { message: "Admin employee ID is required" }),
    adminName: z.string().min(2, { message: "Admin Name is required" }),
    // Matches CreateOrganizationDto's `email` field — renamed from the
    // earlier `workEmail` to match the backend exactly.
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
