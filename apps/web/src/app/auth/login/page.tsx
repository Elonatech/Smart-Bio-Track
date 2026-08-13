"use client";
// Needed because this page uses hooks (useState, react-hook-form,
// useRouter, Zustand) — all client-only, same reasoning as providers.tsx.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { isAxiosError } from "axios";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock, ShieldCheck, Fingerprint, MonitorSmartphone } from "lucide-react";
import { loginSchema, type LoginFormValues } from "@/lib/validation/auth";
import { appClient } from "@/lib/api-client";
import { useAuthStore, type AuthUser } from "@/lib/store/auth-store";

// This is the shape we EXPECT the backend to return on a successful
// login. Matches the PRTS spec's standard API response envelope:
// { success, message, data }. Adjust this if your backend team's
// actual response shape ends up different.
interface LoginResponse {
  success: boolean;
  message: string;
  data: {
    user: AuthUser;
    accessToken: string;
  };
}

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);

  // Local state just for this page: whether a submit is in flight
  // (so we can disable the button / show "Signing in...") and any
  // error message returned by the API (e.g. "Invalid credentials").
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Whether THIS BROWSER has previously completed device registration
  // (see the Device Registration flow — it's meant to write a flag
  // here once that succeeds). Starts `false` so server-rendered HTML
  // and the first client render match exactly (localStorage doesn't
  // exist on the server) — we only know the real answer after mount,
  // same reasoning as `hydrate()` in auth-store.ts.
  const [isDeviceRegistered, setIsDeviceRegistered] = useState(false);

  useEffect(() => {
    setIsDeviceRegistered(localStorage.getItem("deviceRegistered") === "true");
  }, []);

  // react-hook-form manages the form's values, touched/dirty state,
  // and validation for us. zodResolver plugs our Zod schema in as the
  // validation rules, so react-hook-form and Zod share ONE source of
  // truth for "what makes this form valid" instead of two.
  const {
    register,        // spreads onto <input> to wire it up to the form
    handleSubmit,     // wraps our submit function, runs validation first
    formState: { errors }, // field-level validation error messages
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  // This only runs if validation passed (react-hook-form's handleSubmit
  // guarantees that). `values` is already typed as LoginFormValues.
  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    setIsSubmitting(true);

    try {
      const response = await appClient.post<LoginResponse>(
        "/auth/login",
        values
      );

      const { user, accessToken } = response.data.data;

      // Save the session (localStorage + in-memory store) — see
      // auth-store.ts for exactly what this does.
      login(user, accessToken);

      // Send the user somewhere useful post-login. Since role-specific
      // dashboards aren't built yet, this points at the app root for
      // now — swap this for real per-role routing once those exist
      // (e.g. redirect employees to /employee, HR to /hr, etc.).
      router.push("/");
    } catch (error) {
      // Axios throws on non-2xx responses. We try to surface the
      // backend's own error message if it sent one (matching the
      // spec's { success: false, message, error } shape), otherwise
      // fall back to a generic message.
      const message = isAxiosError<{ message?: string }>(error)
        ? (error.response?.data?.message ?? "Something went wrong. Please try again.")
        : "Something went wrong. Please try again.";
      setServerError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* LEFT — branded panel */}
      <div className="relative overflow-hidden bg-primary text-white flex flex-col justify-between p-15 md:w-1/2">
        {/* Background accent — a large, low-opacity echo of the geo-fence
            radius circle. Purely decorative (aria-hidden), positioned
            absolutely so it never affects layout or a11y. Anchored
            bottom-left and mostly cropped off-screen, same placement
            as the reference design. */}
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

        <div className="relative flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" strokeWidth={1.75} />
          <span className="text-lg font-semibold">SmartBioTrack</span>
        </div>

        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium mb-4">
            Multi-signal verification, NDPA-aligned
          </span>
          <h1 className="text-3xl font-semibold mb-3">
            Attendance you can trust
          </h1>
          <p className="text-white/80 max-w-sm">
            Eight independent signals evaluate every punch. No raw
            biometric images are stored on our servers — verification
            happens at the device/OS level.
          </p>
        </div>

        <p className="relative text-sm text-white/60">
          Elonatech Nigeria Limited · West Africa Time (WAT)
        </p>
      </div>

      {/* RIGHT — the actual form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md bg-surface rounded-xl border border-neutral/20 shadow-sm p-8">
          <h2 className="text-2xl font-semibold text-heading mb-1">
            Sign in
          </h2>
          <p className="text-neutral mb-4">
            Use your employee ID or work email to continue.
          </p>

          {/* Registered-device badge. Green + "Registered Device" when
              this browser previously completed device registration;
              neutral + "Device not yet registered" otherwise — matches
              the spec's requirement to surface this before the user
              even tries to log in, not just after a failed attempt. */}
          <div
            className={`mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              isDeviceRegistered
                ? "bg-success/10 text-success"
                : "bg-neutral/10 text-neutral"
            }`}
          >
            <MonitorSmartphone className="h-3.5 w-3.5" strokeWidth={1.75} />
            {isDeviceRegistered ? "Registered device" : "Device not yet registered"}
          </div>

          {/* Server-side error banner — only shows up after a failed
              API call, distinct from per-field validation errors below. */}
          {serverError && (
            <div className="mb-4 rounded-md bg-alert/10 border border-alert/30 text-alert text-sm px-3 py-2">
              {serverError}
            </div>
          )}

          {/* handleSubmit(onSubmit) runs Zod validation first; onSubmit
              (our function above) only fires if validation passes. */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-heading mb-1"
              >
                Employee ID or email
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral"
                  strokeWidth={1.75}
                />
                <input
                  id="email"
                  type="text"
                  {...register("email")}
                  className="w-full rounded-md border border-neutral/40 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              {/* This field-level error only appears once the user has
                  interacted with the field and it fails Zod's rules. */}
              {errors.email && (
                <p className="mt-1 text-sm text-alert">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-heading"
                >
                  Password
                </label>
                <a href="/auth/forgot-password" className="text-sm text-primary">
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral"
                  strokeWidth={1.75}
                />
                <input
                  id="password"
                  type="password"
                  {...register("password")}
                  className="w-full rounded-md border border-neutral/40 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              {errors.password && (
                <p className="mt-1 text-sm text-alert">
                  {errors.password.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md bg-primary text-white py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-neutral/20" />
            <span className="text-xs text-neutral">or</span>
            <div className="h-px flex-1 bg-neutral/20" />
          </div>

          {/* Biometric login — from the spec, was missing from this
              build. Not wired to real WebAuthn yet, just the UI entry
              point; hook up actual biometric auth once the backend
              supports it. */}
          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 rounded-md border border-neutral/40 py-2 text-sm font-medium text-heading hover:bg-neutral/10"
          >
            <Fingerprint className="h-4 w-4" strokeWidth={1.75} />
            Sign in with Face ID / Windows Hello
          </button>

          <p className="mt-6 text-center text-sm text-neutral">
            New organization?{" "}
            <a href="/auth/register" className="text-primary font-medium">
              Create an account
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
