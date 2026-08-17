"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, User, IdCard, Mail, Lock, ShieldCheck } from "lucide-react";
import { registerSchema, type RegisterFormValues } from "@/lib/validation/auth";
import { appClient, extractErrorMessage } from "@/lib/api-client";
import { useAuthStore, type AuthUser } from "@/lib/store/auth-store";

// The ACTUAL current shape of POST /api/auth/register-organization —
// just the token pair, no envelope, no user object. Same situation as
// login's response — see the comment there for the full explanation.
interface RegisterResponse {
  accessToken: string;
  refreshToken: string;
}

// GET /api/auth/me's shape — no `name` field yet. Doesn't matter here
// though, unlike login: we already have adminName from the form itself.
interface MeResponse {
  id: string;
  email: string;
  role: AuthUser["role"];
  organizationId: string | null;
}

export default function RegisterPage() {
  const router = useRouter();

  // Renamed to registerUser: react-hook-form's own `register` function
  // (destructured from useForm below) would otherwise collide with
  // this one — you can't have two `const register` in the same scope.
  const registerUser = useAuthStore((state) => state.register);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

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
      // Deliberately NOT /auth/register — that endpoint is a stopgap
      // for adding a user to an ALREADY-existing org (what Invite
      // Acceptance will use later). Sign Up creates a brand-new org +
      // its first Super Admin, which is register-organization.
      const { data } = await appClient.post<RegisterResponse>(
        "/auth/register-organization",
        values
      );
      const { accessToken, refreshToken } = data;

      const me = await appClient.get<MeResponse>("/auth/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const user: AuthUser = {
        id: me.data.id,
        name: values.adminName, // we already have this from the form; /auth/me doesn't return it
        email: me.data.email,
        role: me.data.role,
        organizationId: me.data.organizationId,
      };

      registerUser(user, accessToken, refreshToken);

      // A brand-new org lands in onboarding, not a dashboard that
      // assumes offices/work rules already exist.
      router.push("/onboarding");
    } catch (error) {
      // extractErrorMessage handles the backend's inconsistent error
      // shapes (plain string, class-validator array, or the doubly-
      // wrapped NestJS HttpException object) — see api-client.ts.
      setServerError(extractErrorMessage(error));
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
          className="pointer-events-none absolute -left-32 -bottom-32 h-[28rem] w-[28rem] rounded-full border border-white/20"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-16 -bottom-16 h-[16rem] w-[16rem] rounded-full border border-white/20"
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
            Set up your organization
          </h1>
          <p className="text-white/80 max-w-sm">
            Create your workspace, then invite HR admins, team leads, and
            employees once you&apos;re in.
          </p>
        </div>

        <p className="relative text-sm text-white/60">
          Elonatech Nigeria Limited · West Africa Time (WAT)
        </p>
      </div>

      {/* RIGHT — the form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md bg-surface rounded-xl border border-neutral/20 shadow-sm p-8">
          <h2 className="text-2xl font-semibold text-heading mb-1">
            Create an account
          </h2>
          <p className="text-neutral mb-6">
            This creates your organization and your Org Super Admin login.
          </p>

          {serverError && (
            <div className="mb-4 rounded-md bg-alert/10 border border-alert/30 text-alert text-sm px-3 py-2">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label
                htmlFor="organizationName"
                className="block text-sm font-medium text-heading mb-1"
              >
                Organization name
              </label>
              <div className="relative">
                <Building2
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral"
                  strokeWidth={1.75}
                />
                <input
                  id="organizationName"
                  type="text"
                  {...register("organizationName")}
                  className="w-full rounded-md border border-neutral/40 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              {errors.organizationName && (
                <p className="mt-1 text-sm text-alert">
                  {errors.organizationName.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="adminName"
                className="block text-sm font-medium text-heading mb-1"
              >
                Your full name
              </label>
              <div className="relative">
                <User
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral"
                  strokeWidth={1.75}
                />
                <input
                  id="adminName"
                  type="text"
                  {...register("adminName")}
                  className="w-full rounded-md border border-neutral/40 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              {errors.adminName && (
                <p className="mt-1 text-sm text-alert">
                  {errors.adminName.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="adminEmployeeId"
                className="block text-sm font-medium text-heading mb-1"
              >
                Your employee ID
              </label>
              <div className="relative">
                <IdCard
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral"
                  strokeWidth={1.75}
                />
                <input
                  id="adminEmployeeId"
                  type="text"
                  placeholder="e.g. ELN-0001"
                  {...register("adminEmployeeId")}
                  className="w-full rounded-md border border-neutral/40 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              {errors.adminEmployeeId && (
                <p className="mt-1 text-sm text-alert">
                  {errors.adminEmployeeId.message}
                </p>
              )}
            </div>

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

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-heading mb-1"
              >
                Confirm password
              </label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral"
                  strokeWidth={1.75}
                />
                <input
                  id="confirmPassword"
                  type="password"
                  {...register("confirmPassword")}
                  className="w-full rounded-md border border-neutral/40 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
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
              {isSubmitting ? "Creating account..." : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-neutral">
            Already have an account?{" "}
            <a href="/auth/login" className="text-primary font-medium">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
