"use client";

import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import { FlaggedPunchList } from "@/app/components/dashboard/FlaggedPunchList";
import { SAMPLE_FLAGGED_PUNCHES } from "@/app/components/dashboard/flaggedPunchSamples";

// HR sees every flagged punch in the organization. A Team Lead sees the
// same queue narrowed to their own department — see
// dashboard/team-lead/exceptions.
export default function HRAdminReviewQueuePage() {
  usePageHeader(
    "Attendance review queue",
    "Flagged punch events awaiting manual review"
  );

  return (
    <div className="pb-8">
      <FlaggedPunchList
        punches={SAMPLE_FLAGGED_PUNCHES}
        emptyMessage="Nothing to review. Every punch cleared automatically."
      />
    </div>
  );
}
