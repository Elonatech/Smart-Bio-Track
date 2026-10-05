"use client";

import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import { MyLeaveRequestsList } from "@/app/components/dashboard/MyLeaveRequestsList";
import { SampleDataBanner } from "@/app/components/dashboard/SampleDataBanner";

// A Team Lead requests their own leave here — same as an Employee. Their
// department's leave decisions still belong to HR's org-wide queue at
// dashboard/hr-admin/leave; this page is only about their own time off.
export default function TeamLeadLeavePage() {
  usePageHeader("Leave requests", "Request time off and track your own requests");

  return (
    <>
      <SampleDataBanner describes="leave requests" />
      <MyLeaveRequestsList emptyMessage="You haven't requested any leave yet." />
    </>
  );
}
