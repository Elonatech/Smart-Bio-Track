"use client";

import { useAuthStore } from "@/lib/store/auth-store";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";

export default function SuperAdminWorkRulesPage() {
  const orgName =
    useAuthStore((state) => state.user?.organizationName) ??
    "Your organization";
  usePageHeader(
    "Work Rules",
    `${orgName} · applied per employee or department`
  );
  return (
    <div>
      <h1 className="text-2xl font-bold text-heading">Work Rules</h1>
      <p className="mt-2 text-sm text-neutral">
        Manage your organization's work rules and policies.
      </p>
    </div>
  );
}
