"use client";

import { useEffect, useState } from "react";
import { Clock4, MapPinned, ShieldAlert, Users } from "lucide-react";
import { appClient } from "@/lib/api-client";
import { useAuthStore } from "@/lib/store/auth-store";
import { SetupReminderBanner } from "@/app/components/dashboard/SetupReminderBanner";
import { TodayStatusCard } from "@/app/components/dashboard/TodayStatusCard";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import { SAMPLE_WORK_RULES } from "@/app/components/dashboard/workRuleSamples";
import { SAMPLE_FLAGGED_PUNCHES } from "@/app/components/dashboard/flaggedPunchSamples";
import { SAMPLE_AUDIT_LOGS } from "@/app/components/dashboard/auditLogSamples";

interface OfficeSummary {
  id: string;
  name: string;
}

// A shorter label per rule than its full form-facing name ("Night Shift
// (Ops)" -> "Night") — this card only has room for a few words, and the
// full names are one click away on the Time Regulation page itself.
function shortRuleLabel(name: string): string {
  return name.split(/[\s(]/)[0];
}

export default function SuperAdminDashboardPage() {
  const orgName = useAuthStore((state) => state.user?.organizationName) ?? "Your organization";
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  usePageHeader("Organization overview", `${orgName} · ${today} · WAT`);

  // Employees and offices are the two numbers on this card with a real
  // backend behind them — everything else here (Time Regulation, Flagged
  // Punches, Recent activity) has no Prisma model yet, so those stay
  // sourced from the same seed data their own pages render rather than
  // being faked into looking live.
  const [employeeCount, setEmployeeCount] = useState<number | null>(null);
  const [offices, setOffices] = useState<OfficeSummary[] | null>(null);

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

    return () => {
      isActive = false;
    };
  }, []);

  // offices === null means "hasn't loaded yet", not "confirmed zero" — an
  // earlier version of this collapsed both to an empty array and showed
  // "No offices yet" for a moment before the real count arrived, which is
  // a false claim, not just a loading flicker.
  const officeNames = offices?.map((o) => o.name) ?? [];
  const officeSubtitle =
    offices === null
      ? ""
      : officeNames.length === 0
        ? "No offices yet"
        : officeNames.length <= 2
          ? officeNames.join(", ")
          : `${officeNames.slice(0, 2).join(", ")} +${officeNames.length - 2} more`;

  const ruleSubtitle = SAMPLE_WORK_RULES.map((r) => shortRuleLabel(r.name)).join(", ");

  // Sample data is already newest-first — real audit entries would need
  // an explicit orderBy, but there is no endpoint to add one to yet.
  const recentActivity = SAMPLE_AUDIT_LOGS.slice(0, 3);

  return (
    <div>
      {/* Only renders while the org has no offices — the way back into
          the setup wizard for anyone who skipped or abandoned it. */}
      <SetupReminderBanner />

      <TodayStatusCard />

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
              Offices & geo-fences
            </p>
            <p className="mt-1 text-[24px] font-semibold text-heading">
              {offices?.length ?? "—"}
            </p>
            <p className="text-[12px] text-neutral">{officeSubtitle}</p>
          </div>
        </div>

        {/* Time Regulation and Flagged Punches below have no backend model —
            counts come from the same seed arrays their own pages render
            (workRuleSamples.ts, flaggedPunchSamples.ts), so this card can
            never show a number those pages don't actually have. */}
        <div className="flex gap-3 items-start bg-surface border border-neutral/20 p-5 rounded-xl">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 mb-3">
            <Clock4 className="h-5 w-5 text-primary" strokeWidth={1.75} />
          </div>
          <div className="flex flex-col items-start">
            <p className="text-xs font-semibold tracking-wide uppercase text-neutral">
              Time Regulation
            </p>
            <p className="mt-1 text-[24px] font-semibold text-heading">
              {SAMPLE_WORK_RULES.length}
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
          {recentActivity.map((log, index) => (
            <div key={log.id}>
              <p className="text-[14px] text-neutral">
                {log.actor} · {log.action.replaceAll("_", " ").toLowerCase()} ·{" "}
                {log.target}
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
