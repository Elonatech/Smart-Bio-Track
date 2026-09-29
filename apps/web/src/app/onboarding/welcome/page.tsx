"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ShieldCheck,
  Users,
  Building2,
  Mail,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

// These point into the Super Admin dashboard, NOT back into the setup
// wizard — the wizard is a one-time first-login flow and re-entering it
// would restart six steps to add one office.
//
// They were previously "/employees", "/offices" and "/invite", none of
// which are real routes: every dashboard page lives under
// /dashboard/<role>/... (see roleRoutes.ts), so all three 404'd.
//
// "Invite your team" has no page of its own — inviting happens through
// the Add person modal on the Employees page, which is where this sends
// you.
const GETTING_STARTED_ITEMS = [
  {
    icon: Users,
    title: "Add employees",
    description:
      "Import your staff list or add people one by one, with departments and shift assignments.",
    href: "/dashboard/super-admin/employees",
  },
  {
    icon: Building2,
    title: "Add another office",
    description:
      "Create additional geo-fences for your branches, warehouses and field sites.",
    href: "/dashboard/super-admin/offices",
  },
  {
    icon: Mail,
    title: "Invite your team",
    description:
      "Send invitations to HR admins and team leads — they set a password and register a device.",
    href: "/dashboard/super-admin/employees",
  },
];

function OnboardingWelcomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgName = searchParams.get("org") || "there";

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary text-white px-4 sm:px-8 py-16 text-center">
        <div className="h-14 w-14 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-4">
          <ShieldCheck className="h-7 w-7" strokeWidth={1.75} />
        </div>
        <p className="text-xs font-medium tracking-wide uppercase text-white/70 mb-2">
          Your workspace is live
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold mb-3">
          Welcome to SmartBioTrack, {orgName}!
        </h1>
        <p className="text-white/80 max-w-xl mx-auto">
          Your organization, first office geo-fence and work rules are
          configured. Here are three things worth doing before your team&apos;s
          first clock-in.
        </p>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-10">
        <p className="text-xs font-medium tracking-wide uppercase text-neutral mb-3">
          Getting started
        </p>

        <div className="space-y-3">
          {GETTING_STARTED_ITEMS.map(({ icon: Icon, title, description, href }) => (
            <button
              key={title}
              type="button"
              onClick={() => router.push(href)}
              className="w-full flex items-start gap-4 rounded-lg border border-neutral/20 bg-surface p-4 text-left hover:border-primary/40 hover:shadow-sm transition"
            >
              <span className="shrink-0 h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <span className="flex-1">
                <span className="block font-medium text-heading">{title}</span>
                <span className="block text-sm text-neutral mt-0.5">
                  {description}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 text-neutral shrink-0 mt-2" />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-6 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
          Setup complete — all times shown in West Africa Time (WAT).
        </div>

        <button
          type="button"
          // Onboarding is only ever completed by the org's Super Admin
          // (the person who just registered/set up the workspace), so
          // this always goes straight to their dashboard — not a
          // generic /dashboard route, which has no page.tsx of its own.
          onClick={() => router.push("/dashboard/super-admin")}
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary text-white px-5 py-2.5 text-sm font-medium hover:bg-primary/90"
        >
          Go to dashboard
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// useSearchParams requires a Suspense boundary in the App Router —
// without this wrapper, the production build fails (confirmed: caught
// this exact error via `next build`, same fix as complete-registration/page.tsx).
export default function OnboardingWelcomePage() {
  return (
    <Suspense fallback={null}>
      <OnboardingWelcomeContent />
    </Suspense>
  );
}
