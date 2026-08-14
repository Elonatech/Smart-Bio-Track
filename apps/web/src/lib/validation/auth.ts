import { z } from "zod";

// Matches @smartbiotrack/constants' PASSWORD_REGEX exactly (packages/constants/index.ts)
// — must contain lowercase, uppercase, a digit, and a special character.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
const PASSWORD_MESSAGE =
  "Must be 8+ characters and include an uppercase letter, a lowercase letter, a number, and a special character.";

export const loginSchema = z.object({
  // Backend's LoginDto only accepts an email today, even though the
  // product spec (and this field's label) says "Employee ID or email."
  // Employee ID login is a documented, not-yet-built gap on the
  // backend — this schema matches what actually works right now.
  email: z.string().email({ message: "Invalid email address" }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters " }),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    organizationName: z
      .string()
      .min(2, { message: "Organization Name is required" }),
    adminEmployeeId: z
      .string()
      .min(2, { message: "Employee ID is required" }),
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
