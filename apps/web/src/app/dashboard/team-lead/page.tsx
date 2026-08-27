"use client";

import {
  CircleCheck,
  CircleX,
  ClipboardCheck,
  Clock4,
  FileText,
  LogIn,
  UserX,
  Users,
} from "lucide-react";
import { useAuthStore } from "@/lib/store/auth-store";
import { TEAM_DEPARTMENT } from "@/lib/teamLeadScope";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";

// The Team Lead's root page. Their overview IS the team roster for
// today — there's no separate "dashboard" worth showing above it, which
// is why the sidebar's first item is "Team Today" for this role rather
// than "Overview".
//
// UI only — no Attendance model in prisma/schema.prisma and no
// attendance module in apps/api/src, so the roster is example data and
// Clock In is disabled rather than wired to nothing.

type MemberStatus = "PRESENT" | "LATE" | "ON_LEAVE" | "ABSENT";

const STATUS_META: Record<
  MemberStatus,
  { label: string; pill: string; icon: typeof CircleCheck }
> = {
  PRESENT: {
    label: "Present",
    pill: "bg-success/10 text-success border-success/30",
    icon: CircleCheck,
  },
  LATE: {
    label: "Late",
    pill: "bg-warning/10 text-warning border-warning/30",
    icon: Clock4,
  },
  ON_LEAVE: {
    label: "On leave",
    pill: "bg-info/10 text-info border-info/30",
    icon: FileText,
  },
  ABSENT: {
    label: "Absent",
    pill: "bg-alert/10 text-alert border-alert/30",
    icon: CircleX,
  },
};

interface TeamMember {
  id: string;
  name: string;
  jobTitle: string;
  clockIn: string | null;
  status: MemberStatus;
}

const TEAM: TeamMember[] = [
  {
    id: "1",
    name: "Chinedu Okafor",
    jobTitle: "Backend Engineer",
    clockIn: "08:42",
    status: "PRESENT",
  },
  {
    id: "2",
    name: "Aisha Bello",
    jobTitle: "Frontend Engineer",
    clockIn: "09:21",
    status: "LATE",
  },
  {
    id: "3",
    name: "Tunde Adeyemi",
    jobTitle: "QA Engineer",
    clockIn: "08:05",
    status: "PRESENT",
  },
  {
    id: "4",
    name: "Ngozi Eze",
    jobTitle: "DevOps Engineer",
    clockIn: null,
    status: "ON_LEAVE",
  },
  {
    id: "5",
    name: "Ibrahim Musa",
    jobTitle: "Data Engineer",
    clockIn: null,
    status: "ABSENT",
  },
];

const PENDING_EXCEPTIONS = 1;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function TeamLeadDashboardPage() {
  const orgName = useAuthStore((state) => state.user?.organizationName);
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  usePageHeader(
    `${TEAM_DEPARTMENT} — today`,
    `${orgName ? `${orgName} · ` : ""}${today} · WAT`
  );

  // Counted off the roster rather than hardcoded, so the cards can't
  // drift out of step with the list underneath them.
  const presentCount = TEAM.filter((m) => m.status === "PRESENT").length;
  const lateCount = TEAM.filter((m) => m.status === "LATE").length;
  const onLeaveCount = TEAM.filter((m) => m.status === "ON_LEAVE").length;
  // On-leave people aren't at work either, so they belong in the absent
  // headline with the approved portion called out underneath — matching
  // how HR's dashboard reads it.
  const absentCount =
    TEAM.filter((m) => m.status === "ABSENT").length + onLeaveCount;

  return (
    <div className="pb-8">
      <div className="flex items-start justify-between gap-4 bg-surface border border-neutral/20 p-5 rounded-xl">
        <div>
          <h5 className="text-xs font-medium tracking-wide uppercase text-neutral border-b border-neutral/30 inline-block pb-0.5">
            Today&apos;s status
          </h5>
          <p className="mt-2 text-[22px] font-semibold text-heading">
            Not clocked in yet
          </p>
          <button
            type="button"
            disabled
            title="Clock-in goes live once the attendance service ships — there's no endpoint to record a punch yet."
            className="mt-6 inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-3 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <LogIn className="h-4 w-4" strokeWidth={2} />
            Clock In
          </button>
        </div>

        <div className="text-right shrink-0">
          <p className="text-[32px] leading-none font-bold text-heading tabular-nums">
            00:00:00
          </p>
          <p className="mt-2 text-xs text-neutral">
            Working hours today · break 00:00
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard
          icon={Users}
          tone="bg-success/15 text-success"
          label="Present"
          value={presentCount}
          hint={`of ${TEAM.length} team members`}
        />
        <StatCard
          icon={Clock4}
          tone="bg-warning/15 text-warning"
          label="Late"
          value={lateCount}
          hint={lateCount === 0 ? "Everyone on time" : "Past the grace period"}
        />
        <StatCard
          icon={UserX}
          tone="bg-alert/10 text-alert"
          label="Absent"
          value={absentCount}
          hint={`${onLeaveCount} on approved leave`}
        />
        <StatCard
          icon={ClipboardCheck}
          tone="bg-warning/15 text-warning"
          label="Pending exceptions"
          value={PENDING_EXCEPTIONS}
          hint="Waiting on your decision"
        />
      </div>

      <div className="bg-surface border border-neutral/20 rounded-xl mt-6 overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral/20">
          <h6 className="text-[15px] font-semibold text-heading">Team roster</h6>
          <p className="text-[12px] text-neutral">
            Today&apos;s first clock-in per person
          </p>
        </div>

        {TEAM.map((member) => {
          const meta = STATUS_META[member.status];
          const StatusIcon = meta.icon;

          return (
            <div
              key={member.id}
              className="flex flex-wrap items-center gap-4 px-5 py-4 border-b border-neutral/10 last:border-0"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                  {getInitials(member.name)}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-heading truncate">
                    {member.name}
                  </p>
                  <p className="text-[12px] text-neutral truncate">
                    {member.jobTitle}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm text-neutral tabular-nums">
                  {member.clockIn ?? "—"}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium ${meta.pill}`}
                >
                  <StatusIcon className="h-3 w-3" strokeWidth={2} />
                  {meta.label}
                </span>
              </div>
            </div>
          );
        })}

        {TEAM.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-neutral">
            No one is assigned to your team yet.
          </p>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  tone: string;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="bg-surface border border-neutral/20 p-5 rounded-xl">
      <div className="flex items-center gap-3">
        <div
          className={`flex items-center justify-center h-9 w-9 rounded-lg shrink-0 ${tone}`}
        >
          <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
        </div>
        <p className="text-[11px] font-semibold tracking-wide uppercase text-neutral">
          {label}
        </p>
      </div>
      <p className="mt-3 text-[28px] leading-none font-semibold text-heading tabular-nums">
        {value}
      </p>
      <p className="mt-2 text-[12px] text-neutral">{hint}</p>
    </div>
  );
}
