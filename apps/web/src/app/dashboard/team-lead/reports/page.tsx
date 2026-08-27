"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { downloadCsv } from "@/lib/csv";
import { TEAM_DEPARTMENT } from "@/lib/teamLeadScope";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";



const EXPECTED_WEEKLY_HOURS = 40;

// Axis floor. A full-time week is 40h, so 60 leaves headroom for normal
// overtime without flattening everyone against the ceiling.
const MIN_CHART_SCALE = 60;

// Axis top, grown to fit the data. Rounds up to a multiple of 20 so the
// tick marks always land on whole numbers, and never drops below
// MIN_CHART_SCALE so a quiet week doesn't exaggerate small differences.
// Without this the axis was fixed at 60 and anyone logging a heavy
// overtime week rendered a bar taller than the plot area.
function getChartScale(hours: number[]): number {
  const highest = Math.max(...hours, EXPECTED_WEEKLY_HOURS);
  return Math.max(MIN_CHART_SCALE, Math.ceil(highest / 20) * 20);
}

interface MemberWeek {
  name: string;
  jobTitle: string;
  hours: number;
  lateDays: number;
  absentDays: number;
  leaveDays: number;
}

// Same five people as the Team Today roster.
const TEAM_WEEK: MemberWeek[] = [
  {
    name: "Chinedu Okafor",
    jobTitle: "Backend Engineer",
    hours: 38.5,
    lateDays: 0,
    absentDays: 0,
    leaveDays: 0,
  },
  {
    name: "Aisha Bello",
    jobTitle: "Frontend Engineer",
    hours: 36.2,
    lateDays: 2,
    absentDays: 0,
    leaveDays: 0,
  },
  {
    name: "Tunde Adeyemi",
    jobTitle: "QA Engineer",
    hours: 38.0,
    lateDays: 0,
    absentDays: 0,
    leaveDays: 0,
  },
  {
    name: "Ngozi Eze",
    jobTitle: "DevOps Engineer",
    hours: 21.5,
    lateDays: 0,
    absentDays: 0,
    leaveDays: 2,
  },
  {
    name: "Ibrahim Musa",
    jobTitle: "Data Engineer",
    hours: 33.8,
    lateDays: 1,
    absentDays: 1,
    leaveDays: 0,
  },
];

const WEEKS = [
  { value: "2026-08-03", label: "week of 3 August 2026" },
  { value: "2026-07-27", label: "week of 27 July 2026" },
  { value: "2026-07-20", label: "week of 20 July 2026" },
];

// First name only — the chart axis has five labels to fit and the full
// names would wrap or collide.
function firstName(fullName: string): string {
  return fullName.split(" ")[0];
}

export default function TeamLeadReportsPage() {
  const [week, setWeek] = useState(WEEKS[0].value);

  const weekLabel =
    WEEKS.find((option) => option.value === week)?.label ?? WEEKS[0].label;

  usePageHeader("Department reports", `${TEAM_DEPARTMENT} · ${weekLabel}`);

  const chartScale = useMemo(
    () => getChartScale(TEAM_WEEK.map((member) => member.hours)),
    []
  );

  // Five labels evenly spaced down the axis, derived from the scale so
  // they can't disagree with the gridlines they sit beside.
  const axisTicks = [4, 3, 2, 1, 0].map((step) => (chartScale * step) / 4);

  const totals = useMemo(
    () =>
      TEAM_WEEK.reduce(
        (running, member) => ({
          hours: running.hours + member.hours,
          lateDays: running.lateDays + member.lateDays,
          absentDays: running.absentDays + member.absentDays,
          leaveDays: running.leaveDays + member.leaveDays,
        }),
        { hours: 0, lateDays: 0, absentDays: 0, leaveDays: 0 }
      ),
    []
  );

  function handleExport() {
    downloadCsv(`${TEAM_DEPARTMENT.toLowerCase()}-week-${week}.csv`, [
      [
        "Name",
        "Job title",
        "Hours",
        "Late days",
        "Absent days",
        "Leave days",
      ],
      ...TEAM_WEEK.map((member) => [
        member.name,
        member.jobTitle,
        member.hours,
        member.lateDays,
        member.absentDays,
        member.leaveDays,
      ]),
      [
        "TOTAL",
        `${TEAM_WEEK.length} team members`,
        totals.hours.toFixed(1),
        totals.lateDays,
        totals.absentDays,
        totals.leaveDays,
      ],
    ]);
  }

  return (
    <div className="pb-8">
      <div className="bg-surface border border-neutral/20 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h6 className="text-[15px] font-semibold text-heading">
              Hours logged this week
            </h6>
            <p className="text-[12px] text-neutral">
              Verified hours per team member · {EXPECTED_WEEKLY_HOURS}h expected
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={week}
              onChange={(event) => setWeek(event.target.value)}
              aria-label="Week"
              className="rounded-md border border-neutral/40 px-3 py-2 text-sm text-heading bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {WEEKS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-2 rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary/90"
            >
              <Download className="h-4 w-4" strokeWidth={1.75} />
              Export CSV
            </button>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <div className="flex flex-col justify-between h-64 w-8 shrink-0 text-right text-[11px] text-neutral tabular-nums">
            {axisTicks.map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>

          {/* Scrolls sideways once the team outgrows the width. The
              y-axis sits OUTSIDE this container so it stays pinned while
              the bars scroll. */}
          <div className="flex-1 min-w-0 overflow-x-auto">
            {/* The inner track carries an explicit minimum width of 4rem
                per person. Below that the bars just share the available
                space as usual; above it the track grows and the whole
                thing scrolls. This has to sit on a wrapper around BOTH
                the plot and the labels — putting the floor on individual
                columns instead lets them overflow a plot area that's
                still only as wide as the viewport, so the gridlines and
                the expectation line stop short of the bars they're
                meant to measure. */}
            <div style={{ minWidth: `${TEAM_WEEK.length * 4}rem` }}>
              <div className="relative h-64">
                <div className="absolute inset-0 flex flex-col justify-between">
                  {[0, 1, 2, 3, 4].map((line) => (
                    <div
                      key={line}
                      className="border-t border-dashed border-neutral/20"
                    />
                  ))}
                </div>

                {/* The 40h expectation drawn across the chart, so a
                    short week is visible at a glance instead of needing
                    mental arithmetic against the axis. */}
                <div
                  style={{
                    bottom: `${(EXPECTED_WEEKLY_HOURS / chartScale) * 100}%`,
                  }}
                  className="absolute inset-x-0 border-t-2 border-dashed border-success/60"
                >
                  <span className="absolute right-0 -top-5 text-[11px] font-medium text-success">
                    {EXPECTED_WEEKLY_HOURS}h expected
                  </span>
                </div>

                {/* Every bar is the same solid colour. An earlier version
                    faded anyone under 40h, but in a normal week that's
                    most of the team — so it washed the whole chart out
                    while telling you nothing the expectation line above
                    doesn't already say. */}
                <div className="relative h-full flex items-end gap-3 sm:gap-6">
                  {TEAM_WEEK.map((member) => (
                    <div
                      key={member.name}
                      className="flex-1 flex flex-col justify-end items-center h-full"
                    >
                      <span className="text-[11px] font-medium text-neutral tabular-nums mb-1">
                        {member.hours}h
                      </span>
                      <div
                        style={{
                          height: `${(member.hours / chartScale) * 100}%`,
                        }}
                        title={`${member.name} · ${member.hours}h of ${EXPECTED_WEEKLY_HOURS}h`}
                        className="w-full rounded-t-md bg-primary"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Same gap as the bars so the labels stay aligned at any
                  width. */}
              <div className="flex gap-3 sm:gap-6 mt-2">
                {TEAM_WEEK.map((member) => (
                  <span
                    key={member.name}
                    title={member.name}
                    className="flex-1 text-center text-[12px] text-neutral truncate"
                  >
                    {firstName(member.name)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* The numbers behind the chart. A bar shows who's short; this
          shows why — late days, absences, approved leave. */}
      <div className="bg-surface border border-neutral/20 rounded-xl mt-6 overflow-hidden">
        <div className="px-5 py-4">
          <h6 className="text-[15px] font-semibold text-heading">
            Per-person breakdown
          </h6>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-neutral/20">
                <th className="text-left px-5 py-3 text-xs font-medium tracking-wide uppercase text-neutral">
                  Team member
                </th>
                <th className="text-right px-5 py-3 text-xs font-medium tracking-wide uppercase text-neutral">
                  Hours
                </th>
                <th className="text-right px-5 py-3 text-xs font-medium tracking-wide uppercase text-warning">
                  Late days
                </th>
                <th className="text-right px-5 py-3 text-xs font-medium tracking-wide uppercase text-alert">
                  Absent days
                </th>
                <th className="text-right px-5 py-3 text-xs font-medium tracking-wide uppercase text-info">
                  Leave days
                </th>
              </tr>
            </thead>

            <tbody>
              {TEAM_WEEK.map((member) => (
                <tr
                  key={member.name}
                  className="border-b border-neutral/10 last:border-0"
                >
                  <td className="px-5 py-4 whitespace-nowrap">
                    <span className="block font-medium text-heading">
                      {member.name}
                    </span>
                    <span className="block text-[12px] text-neutral">
                      {member.jobTitle}
                    </span>
                  </td>
                  <td
                    className={`px-5 py-4 text-right tabular-nums ${
                      member.hours < EXPECTED_WEEKLY_HOURS
                        ? "text-neutral"
                        : "text-heading font-medium"
                    }`}
                  >
                    {member.hours}h
                  </td>
                  <MetricCell value={member.lateDays} tone="text-warning" />
                  <MetricCell value={member.absentDays} tone="text-alert" />
                  <MetricCell value={member.leaveDays} tone="text-info" />
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="border-t border-neutral/20 bg-background/60">
                <td className="px-5 py-4 font-semibold text-heading whitespace-nowrap">
                  Total
                  <span className="block text-[12px] font-normal text-neutral">
                    {TEAM_WEEK.length} team members
                  </span>
                </td>
                <td className="px-5 py-4 text-right font-semibold text-heading tabular-nums">
                  {totals.hours.toFixed(1)}h
                </td>
                <td className="px-5 py-4 text-right font-semibold text-warning tabular-nums">
                  {totals.lateDays}
                </td>
                <td className="px-5 py-4 text-right font-semibold text-alert tabular-nums">
                  {totals.absentDays}
                </td>
                <td className="px-5 py-4 text-right font-semibold text-info tabular-nums">
                  {totals.leaveDays}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// Zero is the good outcome for all three of these columns, so it's
// muted — only the non-zero values should draw the eye.
function MetricCell({ value, tone }: { value: number; tone: string }) {
  return (
    <td
      className={`px-5 py-4 text-right tabular-nums ${
        value > 0 ? tone : "text-neutral"
      }`}
    >
      {value > 0 ? value : "—"}
    </td>
  );
}
