"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Rocket, X } from "lucide-react";
import { appClient } from "@/lib/api-client";
import type { Office } from "@/app/components/dashboard/OfficeFormModal";

// The way back into the setup wizard.
//
// /onboarding used to be reachable from exactly one place — the redirect
// after email verification — so anyone who closed the tab mid-setup could
// never return to it. Nothing linked to it and nothing recorded that it
// was unfinished.
//
// "Unfinished" is derived rather than stored: an organization with zero
// offices hasn't been set up, because attendance is geo-fenced and
// nobody can clock in without one. That needs no new column and no
// backend change — GET /offices already answers it.
// sessionStorage, NOT localStorage: dismissing this means "not now", not
// "never". A permanent dismissal would recreate the exact dead-end this
// banner exists to fix — the wizard would once again have no way back
// into it. Closing the tab clears the flag, so the nudge returns until
// there's actually an office.
//
// The Offices page empty state also links to the wizard, so there is a
// path back even within a session where this was dismissed.
const DISMISS_KEY = "setup-reminder-dismissed";

export function SetupReminderBanner() {
  // Starts hidden and only appears once we KNOW there are no offices —
  // otherwise a fully-configured org gets a flash of "finish setting up"
  // on every page load.
  const [needsSetup, setNeedsSetup] = useState(false);
  const [isDismissed, setIsDismissed] = useState(true);

  useEffect(() => {
    let isActive = true;

    // Read inside the effect because sessionStorage doesn't exist during
    // server rendering.
    try {
      setIsDismissed(sessionStorage.getItem(DISMISS_KEY) === "true");
    } catch {
      setIsDismissed(false);
    }

    appClient
      .get<Office[]>("/offices")
      .then((res) => {
        if (isActive) setNeedsSetup(res.data.length === 0);
      })
      // A failed request is not evidence of an empty org — stay quiet
      // rather than nagging someone whose network just blipped.
      .catch(() => undefined);

    return () => {
      isActive = false;
    };
  }, []);

  function handleDismiss() {
    setIsDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "true");
    } catch {
      // Private browsing with storage blocked — dismissing for this
      // page view only is fine.
    }
  }

  if (!needsSetup || isDismissed) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 bg-primary/10 border border-primary/30 text-primary rounded-xl px-4 py-3 mb-6">
      <Rocket className="h-5 w-5 shrink-0" strokeWidth={1.75} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">Finish setting up your workspace</p>
        <p className="text-[12px] opacity-80">
          You haven&apos;t added an office yet — nobody can clock in until you
          do.
        </p>
      </div>
      <Link
        href="/onboarding"
        className="inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-3 py-2 text-sm font-medium hover:bg-primary/90 shrink-0"
      >
        Continue setup
        <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
      </Link>
      <button
        type="button"
        onClick={handleDismiss}
        title="Hide until your next visit"
        aria-label="Hide until your next visit"
        className="shrink-0 opacity-70 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
