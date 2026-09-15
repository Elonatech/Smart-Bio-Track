"use client";

import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import { MyLeaveRequestsList } from "@/app/components/dashboard/MyLeaveRequestsList";

export default function EmployeeLeavePage() {
  usePageHeader("Leave requests", "Request time off and track your own requests");

  return (
    <MyLeaveRequestsList emptyMessage="You haven't requested any leave yet." />
  );
}
