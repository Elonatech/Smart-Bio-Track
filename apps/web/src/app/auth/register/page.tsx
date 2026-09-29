"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { PasswordInput } from "@/app/components/PasswordInput";
import { registerSchema, type RegisterFormValues } from "@/lib/validation/auth";
import { appClient, extractErrorMessage } from "@/lib/api-client";
import { useToast } from "@/app/components/Toast";

// STEP ONE of org signup. POST /auth/register-organization now takes
// only { email, password } (CreatePendingOrganizationDto): it stores a
// PendingOrganizationSignup row and emails a verification link. It does
// NOT return tokens and does NOT create the organization — that happens
// in step two, at /verify-organization, once the link is opened.
//
// Organization name, admin name and industry are collected there rather
// than here, so an abandoned signup never creates a half-real org that
// squats on a unique name.
interface RegisterResponse {
  message?: string;
}

export default function RegisterPage() {
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Set once the verification email is away — swaps the form out for a
  // confirmation panel rather than leaving a filled form on screen with
  // nothing to do.
  const [sentToEmail, setSentToEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (values: RegisterFormValues) => {
    setServerError(null);
    setIsSubmitting(true);

    try {
      // confirmPassword is a client-side check only — the DTO rejects
      // unknown properties, so only what it declares gets sent.
      await appClient.post<RegisterResponse>("/auth/register-organization", {
        email: values.email,
        password: values.password,
      });
      setSentToEmail(values.email);
      toast.success(
        "Verification link sent successfully",
        "Check " + values.email + " to finish setting up your organization."
      );
    } catch (error) {
      // extractErrorMessage handles the backend's inconsistent error
      // shapes (plain string, class-validator array, or the doubly-
      // wrapped NestJS HttpException object) — see api-client.ts.
      const message = extractErrorMessage(error);
      setServerError(message);
      toast.error("Could not send the verification link", message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* LEFT — branded panel, same treatment as login */}
      <div className="relative overflow-hidden bg-primary text-white flex flex-col justify-between p-15 md:w-1/2">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-32 -bottom-32 h-112 w-md rounded-full border border-white/20"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-16 -bottom-16 h-64 w-[16rem] rounded-full border border-white/20"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-112 w-md rounded-full border border-white/20"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full border border-white/20"
        />

        <Link href="/" className="relative flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" strokeWidth={1.75} />
          <span className="text-lg font-semibold">SmartBioTrack</span>
        </Link>

        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium mb-4">
            Multi-signal verification, NDPA-aligned
          </span>
          <h1 className="text-3xl font-semibold mb-3">
            Set up your organization
          </h1>
          <p className="text-white/80 max-w-sm">
            Verify your email first, then name your workspace and invite HR
            admins, team leads, and employees.
          </p>
        </div>

        <p className="relative text-sm text-white/60">
          Elonatech Nigeria Limited · West Africa Time (WAT)
        </p>
      </div>

      {/* RIGHT — the form, or the confirmation once it's sent */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md bg-surface rounded-xl border border-neutral/20 shadow-sm p-8">
          {sentToEmail ? (
            <div className="text-center">
              <div className="h-12 w-12 rounded-xl bg-success/10 text-success flex items-center justify-center mx-auto mb-4">
                <MailCheck className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <h2 className="text-2xl font-semibold text-heading mb-2">
                Check your inbox
              </h2>
              <p className="text-neutral text-sm">
                We sent a verification link to{" "}
                <span className="font-medium text-heading">{sentToEmail}</span>.
                Open it to name your organization and finish setting up your
                account.
              </p>
              <p className="mt-4 text-xs text-neutral">
                The link expires in a few days. Nothing is created until you
                open it — no organization exists yet.
              </p>
              <button
                type="button"
                onClick={() => setSentToEmail(null)}
                className="mt-6 text-sm font-medium text-primary hover:underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-semibold text-heading mb-1">
                Create an account
              </h2>
              <p className="text-neutral mb-6">
                Start with your work email — you&apos;ll name your organization
                after verifying it.
              </p>

              {serverError && (
                <div className="mb-4 rounded-md bg-alert/10 border border-alert/30 text-alert text-sm px-3 py-2">
                  {serverError}
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-heading mb-1"
                  >
                    Work email
                  </label>
                  <div className="relative">
                    <Mail
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral"
                      strokeWidth={1.75}
                    />
                    <input
                      id="email"
                      type="email"
                      {...register("email")}
                      className="w-full rounded-md border border-neutral/40 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1 text-sm text-alert">
                      {errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-heading mb-1"
                  >
                    Password
                  </label>
                  <PasswordInput
                    id="password"
                    registration={register("password")}
                  />
                  {errors.password && (
                    <p className="mt-1 text-sm text-alert">
                      {errors.password.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-heading mb-1"
                  >
                    Confirm password
                  </label>
                  <PasswordInput
                    id="confirmPassword"
                    registration={register("confirmPassword")}
                  />
                  {errors.confirmPassword && (
                    <p className="mt-1 text-sm text-alert">
                      {errors.confirmPassword.message}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-md bg-primary text-white py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Sending link..." : "Send verification link"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-neutral">
                Already have an account?{" "}
                <Link href="/auth/login" className="text-primary font-medium">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
