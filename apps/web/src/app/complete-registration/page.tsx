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
import {
  useAuthStore,
  toAuthUser,
  type MeResponse,
} from "@/lib/store/auth-store";
import { getDashboardPath } from "@/lib/roleRoutes";

// Second half of the invite flow: an admin provisioned this person via
// POST /users (see users.service.ts's ROLE_CREATION_MATRIX for who can
// invite whom), which created them as PENDING and generated a one-time
// activation token. This page is where they redeem that token and set
// their own password — POST /auth/complete-registration flips them to
// ACTIVE and logs them in immediately, same response shape as login.
// Access token only — the refresh token arrives as an httpOnly cookie.
interface CompleteRegistrationResponse {
  accessToken: string;
}

// MeResponse and toAuthUser are shared — see auth-store.ts.

function ActivateAccountForm() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAuthStore((state) => state.login);

  const token = searchParams.get("token");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ActivateAccountFormValues>({
    resolver: zodResolver(activateAccountSchema),
  });

  const onSubmit = async (values: ActivateAccountFormValues) => {
    if (!token) return;

    setServerError(null);
    setIsSubmitting(true);

    try {
      const { data } = await appClient.post<CompleteRegistrationResponse>(
        "/auth/complete-registration",
        { token, ...values }
      );
      const { accessToken } = data;

      const me = await appClient.get<MeResponse>("/auth/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const user = toAuthUser(me.data);

      toast.success(
        "Account activated successfully",
        "Your password is set and you are signed in."
      );
      login(user, accessToken);
      router.push(getDashboardPath(user.role));
    } catch (error) {
      const message = extractErrorMessage(error);
      setServerError(message);
      toast.error("Could not activate your account", message);
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

        <h1 className="text-2xl font-semibold text-heading mb-1">
          Activate your account
        </h1>
        <p className="text-neutral mb-6">
          Set a password to finish setting up your account.
        </p>

        {!token && (
          <div className="rounded-md bg-alert/10 border border-alert/30 text-alert text-sm px-3 py-2">
            This activation link is missing its token — check the link you
            were given, or ask whoever invited you to resend it.
          </div>
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
                  Password
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
                {isSubmitting ? "Activating..." : "Activate account"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// useSearchParams requires a Suspense boundary in the App Router —
// without this wrapper, Next.js errors at build time.
export default function ActivateAccountPage() {
  return (
    <Suspense fallback={null}>
      <ActivateAccountForm />
    </Suspense>
  );
}
