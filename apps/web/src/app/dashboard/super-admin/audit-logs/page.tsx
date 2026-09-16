"use client";

import { useMemo, useState } from "react";
import { Lock, Search } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth-store";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import { DataTable } from "@/app/components/dashboard/DataTable";
import { SAMPLE_AUDIT_LOGS } from "@/app/components/dashboard/auditLogSamples";

// This is read-only by nature anyway (an audit trail shouldn't have an
// "edit" button even once real), so unlike Time Regulation/Holidays
// there's no form here — just search filtering over the shared seed data
// in auditLogSamples.ts.

export default function SuperAdminAuditLogsPage() {
  const orgName = useAuthStore((state) => state.user?.organizationName) ?? "Your organization";
  const [search, setSearch] = useState("");

  usePageHeader("Audit logs", `${orgName} · append-only`);

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return SAMPLE_AUDIT_LOGS;
    return SAMPLE_AUDIT_LOGS.filter((log) =>
      [log.actor, log.action, log.target, log.ipAddress]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [search]);

  return (
    <div>
      <div className="flex justify-end mb-6">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search audit trail"
            className="w-full rounded-md border border-neutral/40 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 bg-primary/10 text-primary text-sm rounded-md px-4 py-2.5 mb-4">
        <Lock className="h-4 w-4" strokeWidth={1.75} />
        Immutable record · hash-chained and retained for 7 years
      </div>

      <DataTable
        rows={filteredLogs}
        getRowKey={(log) => log.id}
        emptyMessage="No matching audit entries."
        pageSize={15}
        itemLabel="entries"
       
        renderCardHeader={(log) => (
          <div className="min-w-0">
            <p className="text-sm font-medium text-heading wrap-break-word">
              {log.actor}
            </p>
            <p className="text-[12px] text-neutral">{log.timestamp}</p>
          </div>
        )}
        columns={[
          {
            key: "timestamp",
            header: "Timestamp",
            hideOnMobile: true,
            render: (log) => (
              <span className="text-neutral whitespace-nowrap">
                {log.timestamp}
              </span>
            ),
          },
          {
            key: "actor",
            header: "Actor",
            hideOnMobile: true,
            render: (log) => (
              <span className="font-medium text-heading">{log.actor}</span>
            ),
          },
          {
            key: "action",
            header: "Action",
            render: (log) => (
              <span className="inline-block rounded bg-neutral/10 px-2 py-1 text-xs font-mono text-heading break-all">
                {log.action}
              </span>
            ),
          },
          {
            key: "target",
            header: "Target",
            render: (log) => <span className="text-neutral">{log.target}</span>,
          },
          {
            key: "ipAddress",
            header: "IP address",
            render: (log) => (
              <span className="text-neutral whitespace-nowrap">
                {log.ipAddress}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
