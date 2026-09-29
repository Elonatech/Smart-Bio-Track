"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock, Search } from "lucide-react";
import { appClient } from "@/lib/api-client";
import { useAuthStore, type UserRole } from "@/lib/store/auth-store";
import { ROLE_LABEL } from "@/lib/roleCreationMatrix";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import { DataTable } from "@/app/components/dashboard/DataTable";

// Backed by GET /audit-logs (SUPER_ADMIN only — this page lives under
// super-admin/ for that reason, and widening one side without the other
// gets you a blank screen or a 403, not a feature).
//
// Read-only by nature: entries are written by the services that perform the
// actions, inside the same transaction, so there is no create or edit path
// here and there should never be one. A trail anyone can edit is not a trail.
interface AuditLogEntry {
  id: string;
  /** ISO — formatted for the reader's own timezone below, not the server's. */
  createdAt: string;
  actorId: string | null;
  /** "System" for actions no person took. Never blank. */
  actorName: string;
  actorRole: UserRole | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  /** How the target read at the time. Denormalised on the server on purpose. */
  targetLabel: string | null;
  ipAddress: string | null;
}

interface AuditLogPage {
  items: AuditLogEntry[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Denser than the employee list — an audit trail is read by scanning. */
const PAGE_SIZE = 25;

/**
 * Mirrors AUDIT_ACTIONS in apps/api/src/audit/audit.service.ts.
 *
 * The API validates `action` against its own copy and 400s on anything else,
 * so this list only decides what the dropdown offers. Phase 3 adds CLOCK_IN,
 * PUNCH_APPROVED and DEVICE_REVOKED; add them on the server first, then here.
 */
const ACTION_LABEL: Record<string, string> = {
  USER_PROVISIONED: "Person added",
  USER_SUSPENDED: "Person suspended",
  USER_RESTORED: "Person restored",
  USER_DELETED: "Person removed",
  USER_UPDATED: "Details changed",
  USER_REINSTATED: "Person reinstated",
  INVITATION_RESENT: "Invitation resent",
};

/**
 * Formatted in the reader's own timezone rather than the server's.
 *
 * The placeholder data had "WAT" baked into the string. A London auditor
 * reviewing a Lagos organization should see 09:41 in their own time, because
 * the question an audit trail answers is "where was I when this happened?".
 */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

export default function SuperAdminAuditLogsPage() {
  const orgName =
    useAuthStore((state) => state.user?.organizationName) ?? "Your organization";

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Same 300ms as the employee list. Searching is the server's job: the client
  // filter that used to live here could only see the rows already fetched, so
  // once the trail outgrows one page it would search 25 entries and report
  // "no matching entries" for everything before them — which, on an audit
  // screen, reads as "it never happened".
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  // A new search or filter starts at the beginning, or you ask for page 7 of a
  // much shorter result and get an empty table.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, action]);

  const fetchLogs = useCallback(() => {
    setIsLoading(true);
    setError(null);

    appClient
      .get<AuditLogPage>("/audit-logs", {
        params: {
          page,
          limit: PAGE_SIZE,
          ...(debouncedSearch ? { q: debouncedSearch } : {}),
          ...(action ? { action } : {}),
        },
      })
      .then((res) => {
        setLogs(res.data.items);
        setTotal(res.data.total);
        setTotalPages(res.data.totalPages);
      })
      .catch(() => setError("Couldn't load the audit trail. Please try again."))
      .finally(() => setIsLoading(false));
  }, [page, debouncedSearch, action]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  usePageHeader("Audit logs", `${orgName} · append-only`);

  const firstShown = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(page * PAGE_SIZE, total);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-end gap-3 mb-6">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actor or target"
            className="w-full rounded-md border border-neutral/40 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          aria-label="Filter by action"
          className="rounded-md border border-neutral/40 px-3 py-2 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All actions</option>
          {Object.entries(ACTION_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* What this says is what the system actually does. The placeholder here
          claimed the trail was "hash-chained and retained for 7 years"; neither
          is implemented, and a compliance claim the code does not honour is
          the kind of thing that surfaces during an audit at the worst moment.
          Append-only with no edit or delete path is true, and is enough. */}
      <div className="flex items-center gap-2 bg-primary/10 text-primary text-sm rounded-md px-4 py-2.5 mb-4">
        <Lock className="h-4 w-4" strokeWidth={1.75} />
        Append-only record · entries cannot be edited or deleted
      </div>

      {isLoading && (
        <p className="text-sm text-neutral">Loading audit trail...</p>
      )}

      {error && (
        <div className="mb-4 rounded-md bg-alert/10 border border-alert/30 text-alert text-sm px-3 py-2">
          {error}
        </div>
      )}

      {/* "No entries recorded yet" and "nothing matches your filter" are
          different facts, and on this screen confusing them matters. */}
      {!isLoading && !error && logs.length === 0 && (
        <p className="text-sm text-neutral">
          {debouncedSearch || action
            ? "No audit entries match your filter."
            : "No audit entries recorded yet."}
        </p>
      )}

      {!isLoading && logs.length > 0 && (
        <DataTable
          rows={logs}
          getRowKey={(log) => log.id}
          emptyMessage="No matching audit entries."
          // No pageSize: paging is the server's, and letting the table slice
          // again would paginate a page.
          itemLabel="entries"
          renderCardHeader={(log) => (
            <div className="min-w-0">
              <p className="text-sm font-medium text-heading wrap-break-word">
                {log.actorName}
                {log.actorRole ? ` (${ROLE_LABEL[log.actorRole]})` : ""}
              </p>
              <p className="text-[12px] text-neutral">
                {formatTimestamp(log.createdAt)}
              </p>
            </div>
          )}
          columns={[
            {
              key: "createdAt",
              header: "Timestamp",
              hideOnMobile: true,
              render: (log) => (
                <span className="text-neutral whitespace-nowrap">
                  {formatTimestamp(log.createdAt)}
                </span>
              ),
            },
            {
              key: "actor",
              header: "Actor",
              hideOnMobile: true,
              render: (log) => (
                <span className="font-medium text-heading">
                  {log.actorName}
                  {log.actorRole ? ` (${ROLE_LABEL[log.actorRole]})` : ""}
                </span>
              ),
            },
            {
              key: "action",
              header: "Action",
              // The raw action stays visible under the friendly label. An
              // auditor quoting an entry in a dispute needs the exact token,
              // not our wording for it — and an action added on the server
              // before it is added here still reads sensibly.
              render: (log) => (
                <span className="inline-block rounded bg-neutral/10 px-2 py-1 text-xs font-mono text-heading break-all">
                  {ACTION_LABEL[log.action] ?? log.action}
                </span>
              ),
            },
            {
              key: "target",
              header: "Target",
              render: (log) => (
                <span className="text-neutral">{log.targetLabel ?? "—"}</span>
              ),
            },
            {
              key: "ipAddress",
              header: "IP address",
              render: (log) => (
                <span className="text-neutral whitespace-nowrap">
                  {log.ipAddress ?? "—"}
                </span>
              ),
            },
          ]}
        />
      )}

      {/* Server-driven, so the counts describe the whole trail rather than
          what happens to be loaded. */}
      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between gap-3 mt-4 text-sm">
          <p className="text-neutral">
            Showing {firstShown}&ndash;{lastShown} of {total} entr
            {total === 1 ? "y" : "ies"}
          </p>

          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="rounded-md border border-neutral/30 px-3 py-1.5 font-medium text-heading hover:bg-neutral/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-neutral tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                disabled={page >= totalPages}
                className="rounded-md border border-neutral/30 px-3 py-1.5 font-medium text-heading hover:bg-neutral/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
