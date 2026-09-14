"use client";

import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import { FlaggedPunchList } from "@/app/components/dashboard/FlaggedPunchList";
import { SAMPLE_FLAGGED_PUNCHES } from "@/app/components/dashboard/flaggedPunchSamples";

// A Team Lead's slice of the same queue HR sees — their department only.
//
// The narrowing is the server's job and only the server's: GET /users already
// scopes a TEAM_LEAD to their own department, and the flagged-punch endpoint
// will do the same when Phase 3 adds it. This page renders what it is handed.
//
// It used to filter the list here against a hardcoded "Engineering". Two
// things were wrong with that. A browser-side filter is decoration, not
// access control — the rows it hides were still sent, still in the network
// tab, still readable by anyone who looked. And the constant was wrong for
// every lead who wasn't in Engineering. Both are fixed by not doing it here.
export default function TeamLeadExceptionsPage() {
  const punches = SAMPLE_FLAGGED_PUNCHES;

  usePageHeader(
    "Pending exceptions",
    "Flagged punch events from your team awaiting manual review"
  );

  return (
    <div>
      <FlaggedPunchList
        punches={punches}
        emptyMessage="Nothing pending. Every punch from your team cleared automatically."
      />
    </div>
  );
}
