"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldCheck } from "lucide-react";
import { PasswordInput } from "@/app/components/PasswordInput";
import {
  activateAccountSchema,
  type ActivateAccountFormValues,
} from "@/lib/validation/auth";
import { appClient, extractErrorMessage } from "@/lib/api-client";
import { useToast } from "@/app/components/Toast";

// Redeems a reset token from either self-service /auth/forgot-password
// or an admin's "Reset password" action on an employee (both hit the
// same backend POST /auth/reset-password, same token shape). Unlike
// /complete-registration, resetPassword() does NOT return fresh tokens (see
// auth.service.ts) — it just revokes existing sessions and expects the
// user to log in again normally, so this page redirects to /auth/login
// on success instead of logging them in directly.
function ResetPasswordForm() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    // Reusing activateAccountSchema — identical shape to
    // ResetPasswordDto (password + confirmPassword, same regex).
  } = useForm<ActivateAccountFormValues>({
    resolver: zodResolver(activateAccountSchema),
  });

  const onSubmit = async (values: ActivateAccountFormValues) => {
    if (!token) return;

    setServerError(null);
    setIsSubmitting(true);

    try {
      await appClient.post("/auth/reset-password", { token, ...values });
      setIsDone(true);
      toast.success(
        "Password changed successfully",
        "Sign in again with your new password."
      );
    } catch (error) {
      const message = extractErrorMessage(error);
      setServerError(message);
      toast.error("Could not reset your password", message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <div className="w-full max-w-md bg-surface rounded-xl border border-neutral/20 shadow-sm p-8">
        <div className="flex items-center gap-2 mb-6">
          <ShieldCheck className="h-6 w-6 text-primary" strokeWidth={1.75} />
          <span className="text-lg font-semibold text-heading">SmartBioTrack</span>
        </div>

        {isDone ? (
          <>
            <h1 className="text-2xl font-semibold text-heading mb-1">
              Password reset
            </h1>
            <p className="text-neutral mb-6">
              Your password has been changed. Please sign in again with your
              new password.
            </p>
            <button
              type="button"
              onClick={() => router.push("/auth/login")}
              className="w-full rounded-md bg-primary text-white py-2 text-sm font-medium hover:bg-primary/90"
            >
              Go to sign in
            </button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-heading mb-1">
              Set a new password
            </h1>
            <p className="text-neutral mb-6">
              Choose a new password for your account.
            </p>

            {!token && (
              <>
                <div className="rounded-md bg-alert/10 border border-alert/30 text-alert text-sm px-3 py-2">
                  This reset link is missing its token — check the link you
                  were given, or request a new one.
                </div>
                {/* The copy said "request a new one" without offering any
                    way to do it, leaving a dead end on the one screen
                    where the user is already stuck. */}
                <button
                  type="button"
                  onClick={() => router.push("/auth/forgot-password")}
                  className="mt-4 w-full rounded-md bg-primary text-white py-2 text-sm font-medium hover:bg-primary/90"
                >
                  Request a new link
                </button>
              </>
            )}

            {token && (
              <>
                {serverError && (
                  <div className="mb-4 rounded-md bg-alert/10 border border-alert/30 text-alert text-sm px-3 py-2">
                    {serverError}
                  </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div>
                    <label
                      htmlFor="password"
                      className="block text-sm font-medium text-heading mb-1"
                    >
                      New password
                    </label>
                    <PasswordInput id="password" registration={register("password")} />
                    {errors.password && (
                      <p className="mt-1 text-sm text-alert">{errors.password.message}</p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="confirmPassword"
                      className="block text-sm font-medium text-heading mb-1"
                    >
                      Confirm new password
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
                    {isSubmitting ? "Resetting..." : "Reset password"}
                  </button>
                </form>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
