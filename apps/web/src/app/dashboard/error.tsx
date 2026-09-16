"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth-store";
import { getDashboardPath } from "@/lib/roleRoutes";

// Scoped to /dashboard/*, not the whole app — Next.js only replaces this
// segment's content with what's below, so dashboard/layout.tsx's Sidebar
// and DashboardNavbar stay exactly where they were. Someone hitting a
// broken page can still see who they are, still navigate somewhere else,
// still sign out — none of that should vanish just because one page threw.
//
// Without ANY error.tsx anywhere in the app (there wasn't one until this
// file), an uncaught error in a page component showed Next's raw dev
// overlay in development or a blank white page in production, with no
// way back except retyping the URL.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    // Error boundaries do not get server-side logging for free the way a
    // thrown request does — this is the one place a client-render crash
    // is guaranteed to be observed at all. Swap for a real reporting
    // call (Sentry, etc.) when one exists; there isn't one yet.
    console.error("Dashboard error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-md rounded-xl border border-neutral/20 bg-surface p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-alert/10">
          <AlertTriangle className="h-6 w-6 text-alert" strokeWidth={1.75} />
        </div>

        <h1 className="mt-4 text-lg font-semibold text-heading">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-neutral">
          This page hit an error. Nothing you did caused it, and the rest of
          your session is unaffected — try again, or head back to your
          dashboard.
        </p>

      
        {process.env.NODE_ENV === "development" && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-background p-3 text-left text-xs text-alert">
            {error.message}
          </pre>
        )}

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
            Try again
          </button>
          <Link
            href={user ? getDashboardPath(user.role) : "/auth/login"}
            className="rounded-md border border-neutral/30 px-4 py-2 text-sm font-medium text-heading hover:bg-neutral/10"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
