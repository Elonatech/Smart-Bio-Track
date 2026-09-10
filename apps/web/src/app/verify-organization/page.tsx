"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, ShieldCheck, User } from "lucide-react";
import Link from "next/link";
import {
  verifyOrganizationSchema,
  type VerifyOrganizationFormValues,
} from "@/lib/validation/auth";
import { appClient, extractErrorMessage } from "@/lib/api-client";
import { useToast } from "@/app/components/Toast";
import {
  useAuthStore,
  toAuthUser,
  type MeResponse,
} from "@/lib/store/auth-store";

// STEP TWO of org signup. The link in the verification email points
// here — NOT at /auth/verify-organization. See the URL built in
// apps/api/src/mail/mail.service.ts:
//   `${APP_WEB_URL}/verify-organization?token=...`
// If this page ever moves, that string has to move with it.
//
// POST /auth/verify-organization redeems the token, creates the real
// Organization + its SUPER_ADMIN from the email/password banked in step
// one, and returns the token pair — so it logs you straight in, same as
// completeRegistration does for the invite flow.

// Access token only — the refresh token arrives as an httpOnly cookie.
interface VerifyOrganizationResponse {
  accessToken: string;
}

// MeResponse and toAuthUser are shared — see auth-store.ts.

// `industry` is a free-text column on Organization, but a fixed list
// keeps the data groupable instead of collecting twelve spellings of
// "fintech". "Other" is included so nobody is forced into a bad fit.
const INDUSTRIES = [
  "Financial Services",
  "Technology & Software",
  "Telecommunications",
  "Oil & Gas",
  "Manufacturing",
  "Healthcare",
  "Education",
  "Retail & E-commerce",
  "Logistics & Transport",
  "Construction & Real Estate",
  "Hospitality",
  "Public Sector",
  "Other",
];

function VerifyOrganizationForm() {
  const toast = useToast();
  const router = useRouter();
  const registerUser = useAuthStore((state) => state.register);
  const searchParams = useSearchParams();

  // Comes from the emailed link's query string, not typed by the user.
  const token = searchParams.get("token");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VerifyOrganizationFormValues>({
    resolver: zodResolver(verifyOrganizationSchema),
    defaultValues: { organizationName: "", adminName: "", industry: "" },
  });

  const onSubmit = async (values: VerifyOrganizationFormValues) => {
    if (!token) return;

    setServerError(null);
    setIsSubmitting(true);

    try {
      const { data } = await appClient.post<VerifyOrganizationResponse>(
        "/auth/verify-organization",
        { token, ...values }
      );
      const { accessToken } = data;

      // Explicit Authorization header: the token isn't in localStorage
      // yet, and the request interceptor would otherwise attach a stale
      // one from a previous session. See api-client.ts.
      const me = await appClient.get<MeResponse>("/auth/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      // The form already knows both, so they survive an API response that
      // hasn't caught up. The server still wins when it does send them.
      const user = toAuthUser(me.data, {
        name: values.adminName,
        organizationName: values.organizationName,
      });

      toast.success(
        values.organizationName + " created successfully",
        "You are signed in as its Org Super Admin."
      );
      registerUser(user, accessToken);

      // A brand-new org lands in onboarding, not a dashboard that
      // assumes offices and work rules already exist.
      router.push("/onboarding");
    } catch (error) {
      const message = extractErrorMessage(error);
      setServerError(message);
      toast.error("Could not create your organization", message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // No token at all means the page was opened directly rather than from
  // the email. Say so plainly instead of rendering a form that can only
  // fail on submit.
  if (!token) {
    return (
      <div className="w-full max-w-md bg-surface rounded-xl border border-neutral/20 shadow-sm p-8 text-center">
        <div className="h-12 w-12 rounded-xl bg-alert/10 text-alert flex items-center justify-center mx-auto mb-4">
          <ShieldCheck className="h-6 w-6" strokeWidth={1.75} />
        </div>
        <h2 className="text-xl font-semibold text-heading mb-2">
          This link is incomplete
        </h2>
        <p className="text-sm text-neutral mb-6">
          Open the verification link from your email — it carries a one-time
          token this page needs.
        </p>
        <Link
          href="/auth/register"
          className="inline-block rounded-md bg-primary text-white px-4 py-2.5 text-sm font-medium hover:bg-primary/90"
        >
          Start over
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-surface rounded-xl border border-neutral/20 shadow-sm p-8">
      <h2 className="text-2xl font-semibold text-heading mb-1">
        Name your organization
      </h2>
      <p className="text-neutral mb-6">
        Your email is verified. This last step creates the workspace and your
        Org Super Admin account.
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
              placeholder="Elonatech Nigeria Limited"
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
              placeholder="Emeka Uche"
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
            htmlFor="industry"
            className="block text-sm font-medium text-heading mb-1"
          >
            Industry
          </label>
          <select
            id="industry"
            {...register("industry")}
            className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Select an industry</option>
            {INDUSTRIES.map((industry) => (
              <option key={industry} value={industry}>
                {industry}
              </option>
            ))}
          </select>
          {errors.industry && (
            <p className="mt-1 text-sm text-alert">{errors.industry.message}</p>
          )}
        </div>

        {/* No employee ID field: the backend generates the admin's own
            (e.g. "ADM-7K2X9") — see apps/api/src/common/employee-id.util.ts. */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-primary text-white py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Creating organization..." : "Create organization"}
        </button>
      </form>
    </div>
  );
}

export default function VerifyOrganizationPage() {
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* LEFT — same branded panel as register, so the two halves of
          signup read as one flow. */}
      <div className="relative overflow-hidden bg-primary text-white flex flex-col justify-between p-15 md:w-1/2">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-32 -bottom-32 h-112 w-md rounded-full border border-white/20"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-112 w-md rounded-full border border-white/20"
        />

        <Link href="/" className="relative flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" strokeWidth={1.75} />
          <span className="text-lg font-semibold">SmartBioTrack</span>
        </Link>

        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium mb-4">
            Step 2 of 2
          </span>
          <h1 className="text-3xl font-semibold mb-3">Almost there</h1>
          <p className="text-white/80 max-w-sm">
            Tell us what to call your workspace, and we&apos;ll sign you in as
            its Org Super Admin.
          </p>
        </div>

        <p className="relative text-sm text-white/60">
          Elonatech Nigeria Limited · West Africa Time (WAT)
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        {/* useSearchParams needs a Suspense boundary above it, or
            `next build` fails the whole route at prerender time. */}
        <Suspense fallback={null}>
          <VerifyOrganizationForm />
        </Suspense>
      </div>
    </div>
  );
}
