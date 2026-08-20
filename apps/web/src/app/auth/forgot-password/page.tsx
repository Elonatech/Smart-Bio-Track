"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, ShieldCheck, MailCheck } from "lucide-react";
import {
  forgotPasswordSchema,
  type ForgotPasswordFormValues,
} from "@/lib/validation/auth";
import { appClient, extractErrorMessage } from "@/lib/api-client";

export default function ForgotPasswordPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Once the request succeeds, swap the form out for a confirmation
  // message instead of routing away — there's nowhere else to go yet,
  // and "check your inbox" is the actual next step for the user.
  const [isSubmitted, setIsSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    setServerError(null);
    setIsSubmitting(true);

    try {
      // NOTE: POST /auth/forgot-password doesn't exist on the backend
      // yet (flagged as a missing endpoint in the engineering docs) —
      // this will fail until it's built, same situation login/register
      // were in before their endpoints existed.
      await appClient.post("/auth/forgot-password", values);
      setIsSubmitted(true);
    } catch (error) {
      setServerError(extractErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* LEFT — branded panel, same treatment as login/register */}
      <div className="relative overflow-hidden bg-primary text-white flex flex-col justify-between p-15 md:w-1/2">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-32 -bottom-32 h-112 w-md rounded-full border border-white/20"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-16 -bottom-16 h-64 w-64 rounded-full border border-white/20"
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
            Attendance you can trust
          </h1>
          <p className="text-white/80 max-w-sm">
            Eight independent signals evaluate every punch. No raw biometric
            images are stored on our servers — verification happens at the
            device/OS level.
          </p>
        </div>

        <p className="relative text-sm text-white/60">
          Elonatech Nigeria Limited · West Africa Time (WAT)
        </p>
      </div>

      {/* RIGHT — the form (or its confirmation state) */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md bg-surface rounded-xl border border-neutral/20 shadow-sm p-8">
          {isSubmitted ? (
            <div className="text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
                <MailCheck className="h-6 w-6" strokeWidth={1.75} />
              </span>
              <h2 className="mt-4 text-2xl font-semibold text-heading">
                Check your inbox
              </h2>
              <p className="mt-2 text-sm text-neutral">
                If an account exists for{" "}
                <span className="font-medium text-heading">
                  {getValues("email")}
                </span>
                , we've sent a link to reset your password.
              </p>
              <Link
                href="/auth/login"
                className="mt-6 inline-block text-sm font-medium text-primary"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-semibold text-heading mb-1">
                Forgot your password?
              </h2>
              <p className="text-sm text-neutral mb-6">
                Enter your work email and we&apos;ll send a secure reset link.
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
                      className="w-full rounded-md border border-n eutral/40 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1 text-sm text-alert">
                      {errors.email.message}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-md bg-primary text-white py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Sending..." : "Send reset link"}
                </button>
              </form>

              <Link
                href="/auth/login"
                className="mt-6 block text-center text-sm font-medium text-primary"
              >
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
