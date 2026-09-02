"use client";

import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import { FlaggedPunchList } from "@/app/components/dashboard/FlaggedPunchList";
import { SAMPLE_FLAGGED_PUNCHES } from "@/app/components/dashboard/flaggedPunchSamples";
import { TEAM_DEPARTMENT } from "@/lib/teamLeadScope";

// A Team Lead's slice of the same queue HR sees — their department only.
// Filtered here because the sample data is static; a real API would
// narrow it server-side from the caller's own departmentId, which isn't
// something the browser should be trusted to do.
export default function TeamLeadExceptionsPage() {
  const punches = SAMPLE_FLAGGED_PUNCHES.filter(
    (punch) => punch.department === TEAM_DEPARTMENT
  );

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
