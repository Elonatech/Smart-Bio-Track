"use client";

import { useMemo, useState } from "react";
import { Lock, Search } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth-store";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";

// Seeded example data — no backend AuditLog model or API exists yet
// (no Prisma model, no controller/service, confirmed by search). This
// is read-only by nature anyway (an audit trail shouldn't have an
// "edit" button even once real), so unlike Work Rules/Holidays there's
// no form here — just search filtering over local data. Swap the
// seed array for a real appClient.get('/audit-logs') once that exists.
interface AuditLogEntry {
  id: string;
  timestamp: string; // already formatted — a real API would likely
                       // return an ISO string to format client-side
  actor: string;
  action: string;
  target: string;
  ipAddress: string;
}

const INITIAL_LOGS: AuditLogEntry[] = [
  {
    id: "1",
    timestamp: "10 Aug 2026, 09:41:12 WAT",
    actor: "Adaeze Nwosu (HR Admin)",
    action: "PUNCH_APPROVED",
    target: "PN-88213 · Aisha Bello",
    ipAddress: "102.89.44.10",
  },
  {
    id: "2",
    timestamp: "10 Aug 2026, 09:12:04 WAT",
    actor: "System",
    action: "PUNCH_FLAGGED",
    target: "PN-88213 · trust score 58",
    ipAddress: "—",
  },
  {
    id: "3",
    timestamp: "10 Aug 2026, 08:42:57 WAT",
    actor: "Chinedu Okafor (Employee)",
    action: "CLOCK_IN",
    target: "Lagos HQ · score 94",
    ipAddress: "102.89.12.77",
  },
  {
    id: "4",
    timestamp: "09 Aug 2026, 17:22:31 WAT",
    actor: "Emeka Uche (Org Super Admin)",
    action: "WORK_RULE_UPDATED",
    target: "Night Shift (Ops) · grace 10 min",
    ipAddress: "41.203.9.4",
  },
  {
    id: "5",
    timestamp: "09 Aug 2026, 11:03:19 WAT",
    actor: "Adaeze Nwosu (HR Admin)",
    action: "DEVICE_REVOKED",
    target: "EMP-1156 · Samsung A54",
    ipAddress: "102.89.44.10",
  },
];

export default function SuperAdminAuditLogsPage() {
  const orgName = useAuthStore((state) => state.user?.organizationName) ?? "Your organization";
  const [search, setSearch] = useState("");

  usePageHeader("Audit logs", `${orgName} · append-only`);

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return INITIAL_LOGS;
    return INITIAL_LOGS.filter((log) =>
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

      <div className="bg-surface border border-neutral/20 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral/20">
                <th className="text-left px-6 py-3 text-xs font-medium tracking-wide uppercase text-neutral">
                  Timestamp
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium tracking-wide uppercase text-neutral">
                  Actor
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium tracking-wide uppercase text-neutral">
                  Action
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium tracking-wide uppercase text-neutral">
                  Target
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium tracking-wide uppercase text-neutral">
                  IP address
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id} className="border-b border-neutral/10 last:border-0">
                  <td className="px-6 py-4 text-neutral whitespace-nowrap">
                    {log.timestamp}
                  </td>
                  <td className="px-6 py-4 font-medium text-heading whitespace-nowrap">
                    {log.actor}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-block rounded bg-neutral/10 px-2 py-1 text-xs font-mono text-heading">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-neutral whitespace-nowrap">
                    {log.target}
                  </td>
                  <td className="px-6 py-4 text-neutral whitespace-nowrap">
                    {log.ipAddress}
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-neutral">
                    No matching audit entries.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
