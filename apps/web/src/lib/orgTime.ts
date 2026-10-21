"use client";

import { useEffect, useState } from "react";
import { fetchOrganization } from "@/lib/organization";
import { useAuthStore } from "@/lib/store/auth-store";

// Every time the app shows is in the ORGANISATION's time zone, not the
// viewer's — backend decision 1.1 (reply of 20 Oct 2026). Every day boundary
// in the system is the organisation's (which date a punch belongs to, the
// today card, history, the end-of-day job); showing times in the viewer's
// zone would let a 00:30 clock-in appear under a different date from the one
// its summary is filed under. A manager travelling with a laptop set to London
// still sees Lagos times.
//
// Screens that get `timeZone` in their own API response (today, history) use
// that. Everything else uses useOrgTimeZone(), which asks GET /organization
// once per organisation and shares the answer.

let cached: { organizationId: string; timeZone: Promise<string> } | null = null;

function orgTimeZone(organizationId: string): Promise<string> {
  if (cached?.organizationId !== organizationId) {
    cached = {
      organizationId,
      timeZone: fetchOrganization().then((org) => org.timezone),
    };
    // A failed lookup must not stick: forget it so the next screen retries.
    cached.timeZone.catch(() => {
      cached = null;
    });
  }
  return cached.timeZone;
}

/**
 * The signed-in organisation's IANA zone, or undefined until it's known.
 * Formatters treat undefined as "the browser's zone", which is the same zone
 * for nearly everyone today — so the brief wait never shows a wrong-looking
 * time in practice.
 */
export function useOrgTimeZone(): string | undefined {
  const organizationId = useAuthStore((state) => state.user?.organizationId);
  const [timeZone, setTimeZone] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!organizationId) return;
    let isActive = true;
    try {
      orgTimeZone(organizationId)
        .then((zone) => {
          if (isActive) setTimeZone(zone);
        })
        .catch(() => {
          // Leave it undefined: times fall back to the browser's zone.
        });
    } catch {
      // No API client available (some tests) — same fallback.
    }
    return () => {
      isActive = false;
    };
  }, [organizationId]);

  return timeZone;
}

/** "Africa/Lagos" → "Lagos time". Readable, and right for any zone. */
export function zoneLabel(timeZone: string | undefined): string {
  if (!timeZone) return "";
  const city = timeZone.split("/").pop() ?? timeZone;
  return `${city.replace(/_/g, " ")} time`;
}

/** Today's date in the organisation's zone, e.g. "Wednesday, 21 October 2026". */
export function formatOrgToday(timeZone: string | undefined, now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(now);
}

/** Test-only: forget the cached zone between tests. */
export function resetOrgTimeZoneCache(): void {
  cached = null;
}
