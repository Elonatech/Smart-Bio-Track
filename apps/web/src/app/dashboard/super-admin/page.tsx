"use client";

import { useEffect, useState } from "react";
import { Clock4, MapPinned, ShieldAlert, Users } from "lucide-react";
import { appClient } from "@/lib/api-client";
import { useAuthStore } from "@/lib/store/auth-store";
import { SetupReminderBanner } from "@/app/components/dashboard/SetupReminderBanner";
import { OrgTodayPanel } from "@/app/components/dashboard/OrgTodayPanel";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import { formatOrgToday, useOrgTimeZone, zoneLabel } from "@/lib/orgTime";
import { fetchWorkRules, type WorkRule } from "@/lib/workRules";
import { SAMPLE_FLAGGED_PUNCHES } from "@/app/components/dashboard/flaggedPunchSamples";
import { SampleDataBanner } from "@/app/components/dashboard/SampleDataBanner";

interface OfficeSummary {
  id: string;
  name: string;
}

// Only the fields this widget actually renders — the full shape (with
// actorRole, targetType, etc.) lives in the audit-logs page itself, which
// is the one place that needs all of it.
interface RecentAuditEntry {
  id: string;
  actorName: string;
  action: string;
  targetLabel: string | null;
}

export default function SuperAdminDashboardPage() {
  const orgName = useAuthStore((state) => state.user?.organizationName) ?? "Your organization";
  // The organisation's date and zone, not the browser's (decision 1.1).
  const timeZone = useOrgTimeZone();
  const today = formatOrgToday(timeZone);
  const zone = timeZone ? ` · ${zoneLabel(timeZone)}` : "";
  usePageHeader("Organization overview", `${orgName} · ${today}${zone}`);

  // Employees, offices, work rules and recent activity are real. Flagged
  // Punches still has no backend (Phase 4), so that card stays sourced from
  // the same seed data its own page renders rather than faked into looking live.
  const [employeeCount, setEmployeeCount] = useState<number | null>(null);
  const [offices, setOffices] = useState<OfficeSummary[] | null>(null);
  const [workRules, setWorkRules] = useState<WorkRule[] | null>(null);
  const [recentActivity, setRecentActivity] =  useState<RecentAuditEntry[] | null>(null);
  const [recentActivityError, setRecentActivityError] = useState(false);

  useEffect(() => {
    let isActive = true;

    // total comes from the backend's own COUNT query (users.service.ts),
    // not the length of whatever page is returned — accurate regardless
    // of page size, so limit:1 is enough to ask for it cheaply.
    appClient
      .get<{ total: number }>("/users", { params: { page: 1, limit: 1 } })
      .then((res) => {
        if (isActive) setEmployeeCount(res.data.total);
      })
      .catch(() => {
        // Leaves the card showing "—" rather than a wrong number.
      });

    appClient
      .get<OfficeSummary[]>("/offices")
      .then((res) => {
        if (isActive) setOffices(res.data);
      })
      .catch(() => {});

    fetchWorkRules()
      .then((rules) => {
        if (isActive) setWorkRules(rules);
      })
      .catch(() => {});

    // page 1 is always newest-first (the endpoint orders by createdAt desc),
    // so the first 3 of a 3-row page is just "the 3 most recent entries".
    appClient
      .get<{ items: RecentAuditEntry[] }>("/audit-logs", {
        params: { page: 1, limit: 3 },
      })
      .then((res) => {
        if (isActive) setRecentActivity(res.data.items);
      })
      .catch(() => {
        // Distinct from "no entries yet" (an empty array) — a fetch
        // failure should say so, not quietly claim a quiet organization.
        if (isActive) setRecentActivityError(true);
      });

    return () => {
      isActive = false;
    };
  }, []);

  // offices === null means "hasn't loaded yet", not "confirmed zero" — an
  // earlier version of this collapsed both to an empty array and showed
  // "No branches yet" for a moment before the real count arrived, which is
  // a false claim, not just a loading flicker.
  const officeNames = offices?.map((o) => o.name) ?? [];
  const officeSubtitle =
    offices === null
      ? ""
      : officeNames.length === 0
        ? "No branches yet"
        : officeNames.length <= 2
          ? officeNames.join(", ")
          : `${officeNames.slice(0, 2).join(", ")} +${officeNames.length - 2} more`;

  // Same null-means-loading rule as offices above. Names only the default:
  // the big number is already the count, the default is the rule that
  // applies to everyone, and one name stays one line however many rules
  // an organisation has.
  const defaultRule = workRules?.find((r) => r.isDefault);
  const ruleSubtitle =
    workRules === null
      ? ""
      : workRules.length === 0
        ? "None yet — nobody is marked late"
        : defaultRule
          ? `Default: ${defaultRule.name}`
          : "";

  return (
    <div>
      <SampleDataBanner partial />
      {/* Only renders while the org has no offices — the way back into
          the setup wizard for anyone who skipped or abandoned it. */}
      <SetupReminderBanner />

      {/* Super Admins don't clock in, so the overview opens on the whole
          organisation's day instead of a personal clock-in card. Its
          numbers are sample until the summary endpoint exists — see
          lib/orgToday.ts. */}
      <OrgTodayPanel />

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="flex gap-3 items-start bg-surface border border-neutral/20 p-5 rounded-xl">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-success/20 mb-3">
            <Users className="h-5 w-5 text-success" strokeWidth={1.75} />
          </div>
          <div className="flex flex-col items-start">
            <p className="text-xs font-semibold tracking-wide uppercase text-neutral">
              Employees
            </p>
            <p className="mt-1 text-[24px] font-semibold text-heading">
              {employeeCount ?? "—"}
            </p>
            {/* No device model exists yet (see project_smartbiotrack_known_gaps)
                — "active devices" was a fabricated number with nothing behind
                it. Left blank rather than inventing a replacement metric. */}
          </div>
        </div>

        <div className="flex gap-3 items-start bg-surface border border-neutral/20 p-5 rounded-xl">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 mb-3">
            <MapPinned className="h-5 w-5 text-primary" strokeWidth={1.75} />
          </div>
          <div className="flex flex-col items-start">
            <p className="text-xs font-semibold tracking-wide uppercase text-neutral">
              Branches & geo-fences
            </p>
            <p className="mt-1 text-[24px] font-semibold text-heading">
              {offices?.length ?? "—"}
            </p>
            <p className="text-[12px] text-neutral">{officeSubtitle}</p>
          </div>
        </div>

        {/* Real (GET /work-rules). Flagged Punches, after it, still has no
            backend — its count comes from flaggedPunchSamples.ts, the same
            array its own page renders. */}
        <div className="flex gap-3 items-start bg-surface border border-neutral/20 p-5 rounded-xl">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 mb-3">
            <Clock4 className="h-5 w-5 text-primary" strokeWidth={1.75} />
          </div>
          <div className="flex flex-col items-start">
            <p className="text-xs font-semibold tracking-wide uppercase text-neutral">
              Time Regulation
            </p>
            <p className="mt-1 text-[24px] font-semibold text-heading">
              {workRules?.length ?? "—"}
            </p>
            <p className="text-[12px] text-neutral">{ruleSubtitle}</p>
          </div>
        </div>

        <div className="flex gap-3 items-start bg-surface border border-neutral/20 p-5 rounded-xl">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-warning/15 mb-3">
            <ShieldAlert className="h-5 w-5 text-warning" strokeWidth={2} />
          </div>
          <div className="flex flex-col items-start">
            <p className="text-xs font-semibold tracking-wide uppercase text-neutral">
              Flagged punches (24h)
            </p>
            <p className="mt-1 text-[24px] font-semibold text-heading">
              {SAMPLE_FLAGGED_PUNCHES.length}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-neutral/20 p-5 rounded-xl mt-6">
        <div>
          <h6 className="text-[15px] font-semibold">Recent activity</h6>
          <p className="text-[12px] text-neutral">
            Configuration and attendance events in your organization
          </p>
        </div>

        <div className="flex flex-col gap-3 mt-6">
          {recentActivity === null && !recentActivityError && (
            <p className="text-[13px] text-neutral">Loading recent activity…</p>
          )}

          {recentActivityError && (
            <p className="text-[13px] text-alert">
              Couldn&apos;t load recent activity. Please refresh.
            </p>
          )}

          {recentActivity !== null && recentActivity.length === 0 && (
            <p className="text-[13px] text-neutral">No activity recorded yet.</p>
          )}

          {recentActivity !== null &&
            recentActivity.map((log, index) => (
              <div key={log.id}>
                <p className="text-[14px] text-neutral">
                  {log.actorName} · {log.action.replaceAll("_", " ").toLowerCase()}
                  {log.targetLabel ? ` · ${log.targetLabel}` : ""}
                </p>
                {index !== recentActivity.length - 1 && (
                  <hr className="border-neutral/20 mt-3" />
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
