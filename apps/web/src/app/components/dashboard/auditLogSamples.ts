// Seeded example data — no backend AuditLog model or API exists yet (no
// Prisma model, no controller/service, confirmed by search). Shared by
// the Audit Logs page and the Super Admin overview's "Recent activity"
// panel, same reasoning as flaggedPunchSamples.ts and workRuleSamples.ts:
// one seed array both screens read from, so the overview's preview can
// never show something the full page doesn't actually have. Swap for a
// real appClient.get('/audit-logs') once that endpoint exists.
export interface AuditLogEntry {
  id: string;
  timestamp: string; // already formatted — a real API would likely
                       // return an ISO string to format client-side
  actor: string;
  action: string;
  target: string;
  ipAddress: string;
}

export const SAMPLE_AUDIT_LOGS: AuditLogEntry[] = [
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
