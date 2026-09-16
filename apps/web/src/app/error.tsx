"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

// Catches anything NOT under /dashboard/* — marketing pages, auth pages,
// onboarding. dashboard/error.tsx handles that segment on its own so the
// sidebar survives a crash there; this is the equivalent fallback for
// everywhere else, where there is no persistent shell to preserve.
export default function GlobalPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page error boundary caught:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-xl border border-neutral/20 bg-surface p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-alert/10">
          <AlertTriangle className="h-6 w-6 text-alert" strokeWidth={1.75} />
        </div>

        <h1 className="mt-4 text-lg font-semibold text-heading">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-neutral">
          The page hit an error loading. Try again, or head back home.
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
            href="/"
            className="rounded-md border border-neutral/30 px-4 py-2 text-sm font-medium text-heading hover:bg-neutral/10"
          >
            Back home
          </Link>
        </div>
      </div>
    </main>
  );
}
