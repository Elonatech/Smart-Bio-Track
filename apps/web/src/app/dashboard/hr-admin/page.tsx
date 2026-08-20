"use client";

import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";

// AuthGuard is applied once in dashboard/layout.tsx, wrapping every
// role's page — no need to repeat it here.
export default function HRAdminDashboardPage() {
  usePageHeader("HR overview", "");

  return (
    <div>
      <h1 className="text-2xl font-bold">HR Admin Dashboard</h1>
    </div>
  );
}
