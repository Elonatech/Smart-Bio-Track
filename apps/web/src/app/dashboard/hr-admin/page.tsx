"use client";

import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  Clock4,
  Info,
  Users,
  UserX,
} from "lucide-react";
import { useAuthStore } from "@/lib/store/auth-store";
import { TodayStatusCard } from "@/app/components/dashboard/TodayStatusCard";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";

// HR Admin's overview. UI only — there is no attendance backend yet
// (prisma/schema.prisma has just Organization / Department / Office /
// User + the token tables), so every figure here is example data and
// Clock In is disabled rather than wired to nothing.
//
// The four charts are hand-built with CSS and inline SVG on purpose:
// apps/web has no charting dependency, and adding Recharts for one page
// would cost far more bundle than these few shapes are worth. Each one
// reads from a small typed array at the top of the file, so swapping in
// a real API response later means replacing data, not markup.

const CHART_SCALE_DAILY = 220; // headroom above the 203-employee headcount

interface DailyBar {
  day: string;
  present: number;
  late: number;
  absent: number;
}

const DAILY: DailyBar[] = [
  { day: "Mon", present: 171, late: 24, absent: 8 },
  { day: "Tue", present: 168, late: 21, absent: 9 },
  { day: "Wed", present: 176, late: 14, absent: 7 },
  { day: "Thu", present: 173, late: 17, absent: 6 },
  { day: "Fri", present: 165, late: 25, absent: 11 },
];

const CHART_SCALE_DEPARTMENT = 80;

interface DepartmentBar {
  name: string;
  present: number;
  late: number;
  absent: number;
}

const DEPARTMENTS: DepartmentBar[] = [
  { name: "Engineering", present: 58, late: 6, absent: 3 },
  { name: "Field Operations", present: 38, late: 7, absent: 5 },
  { name: "Finance", present: 16, late: 1, absent: 1 },
  { name: "Human Resources", present: 11, late: 1, absent: 0 },
  { name: "Customer Success", present: 28, late: 6, absent: 3 },
];

const MONTHS = ["Mar", "Apr", "May", "Jun", "Jul", "Aug"];
const ATTENDANCE_RATE = [95.2, 94.1, 95.8, 96.4, 95.1, 96.9];
const LATENESS_RATE = [7.4, 8.9, 6.8, 6.1, 7.7, 6.3];

const TRUST_OUTCOMES = [
  { label: "Approved", value: 91, dot: "bg-success", stroke: "stroke-success" },
  { label: "Flagged", value: 6, dot: "bg-warning", stroke: "stroke-warning" },
  { label: "Rejected", value: 3, dot: "bg-alert", stroke: "stroke-alert" },
];

// Present / Late / Absent are the same three series in three different
// charts, so their colours live in one place.
const SERIES = [
  { key: "present", label: "Present", bar: "bg-success", dot: "bg-success" },
  { key: "late", label: "Late", bar: "bg-warning", dot: "bg-warning" },
  { key: "absent", label: "Absent", bar: "bg-alert", dot: "bg-alert" },
] as const;

export default function HRAdminDashboardPage() {
  const orgName =
    useAuthStore((state) => state.user?.organizationName) ??
    "Your organization";
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  usePageHeader("HR dashboard", `${today} · WAT`);

  return (
    <div className="pb-8">
      {/* Today's status — HR admins clock in like everyone else. */}
      <TodayStatusCard />

  

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard
          icon={Users}
          tone="bg-success/15 text-success"
          label="Present today"
          value="171"
          hint="of 203 active employees"
        />
        <StatCard
          icon={Clock4}
          tone="bg-warning/15 text-warning"
          label="Late today"
          value="24"
          hint="Grace period 15 min"
        />
        <StatCard
          icon={UserX}
          tone="bg-alert/10 text-alert"
          label="Absent today"
          value="8"
          hint="2 on approved leave"
        />
        <StatCard
          icon={ClipboardCheck}
          tone="bg-warning/15 text-warning"
          label="Pending reviews"
          value="2"
          hint="Flagged punches"
        />
      </div>

      {/* Row 2 — daily attendance + department breakdown */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
        <ChartCard title="Daily attendance" subtitle="This week, all offices">
          <div className="mt-6 flex gap-3">
            {/* Y axis. Rendered high-to-low so it reads top-down. */}
            <div className="flex flex-col justify-between h-56 w-9 shrink-0 text-right text-[11px] text-neutral tabular-nums">
              {[220, 165, 110, 55, 0].map((tick) => (
                <span key={tick}>{tick}</span>
              ))}
            </div>

            <div className="flex-1 min-w-0">
              <div className="relative h-56">
                {/* Gridlines sit behind the bars at the same five stops
                    as the axis labels. */}
                <div className="absolute inset-0 flex flex-col justify-between">
                  {[0, 1, 2, 3, 4].map((line) => (
                    <div
                      key={line}
                      className="border-t border-dashed border-neutral/20"
                    />
                  ))}
                </div>

                <div className="relative h-full flex items-end gap-3 sm:gap-6">
                  {DAILY.map((entry) => {
                    const total = entry.present + entry.late + entry.absent;
                    return (
                      <div
                        key={entry.day}
                        className="flex-1 flex items-end h-full"
                      >
                        {/* Outer height = share of the axis scale;
                            inner segments split that height by flex-grow,
                            so the stack always fills exactly. */}
                        <div
                          style={{
                            height: `${(total / CHART_SCALE_DAILY) * 100}%`,
                          }}
                          title={`${entry.day} · ${entry.present} present, ${entry.late} late, ${entry.absent} absent`}
                          className="w-full flex flex-col overflow-hidden rounded-t-md"
                        >
                          <div
                            style={{ flexGrow: entry.absent }}
                            className="bg-alert"
                          />
                          <div
                            style={{ flexGrow: entry.late }}
                            className="bg-warning"
                          />
                          <div
                            style={{ flexGrow: entry.present }}
                            className="bg-success"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Same gap as the bars so labels stay aligned. */}
              <div className="flex gap-3 sm:gap-6 mt-2">
                {DAILY.map((entry) => (
                  <span
                    key={entry.day}
                    className="flex-1 text-center text-[12px] text-neutral"
                  >
                    {entry.day}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <Legend />
        </ChartCard>

        <ChartCard title="Department breakdown" subtitle="Today, by department">
          <div className="mt-6 space-y-3">
            {DEPARTMENTS.map((dept) => {
              const total = dept.present + dept.late + dept.absent;
              return (
                <div key={dept.name} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-right text-[11px] leading-tight text-neutral">
                    {dept.name}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div
                      style={{
                        width: `${(total / CHART_SCALE_DEPARTMENT) * 100}%`,
                      }}
                      title={`${dept.name} · ${dept.present} present, ${dept.late} late, ${dept.absent} absent`}
                      className="h-7 flex overflow-hidden rounded-r-md"
                    >
                      <div
                        style={{ flexGrow: dept.present }}
                        className="bg-success"
                      />
                      <div
                        style={{ flexGrow: dept.late }}
                        className="bg-warning"
                      />
                      <div
                        style={{ flexGrow: dept.absent }}
                        className="bg-alert"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* X axis, offset by the same 24 + gap the labels occupy. */}
          <div className="flex gap-3 mt-2">
            <span className="w-24 shrink-0" />
            <div className="flex-1 min-w-0 flex justify-between text-[11px] text-neutral tabular-nums">
              {[0, 20, 40, 60, 80].map((tick) => (
                <span key={tick}>{tick}</span>
              ))}
            </div>
          </div>

          <Legend />
        </ChartCard>
      </div>

      {/* Row 3 — monthly trend lines + trust score donut */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
        <ChartCard
          title="Monthly trends"
          subtitle="Attendance rate vs lateness rate (%)"
        >
          <TrendChart />
          <div className="flex flex-wrap items-center justify-center gap-5 mt-4">
            <LegendItem className="bg-primary" label="Attendance %" />
            <LegendItem className="bg-warning" label="Lateness %" />
          </div>
        </ChartCard>

        <ChartCard
          title="Trust score outcomes"
          subtitle="Last 30 days, all punches"
        >
          <TrustDonut />
          <div className="flex flex-wrap items-center justify-center gap-5 mt-4">
            {TRUST_OUTCOMES.map((slice) => (
              <LegendItem
                key={slice.label}
                className={slice.dot}
                label={`${slice.label} · ${slice.value}%`}
              />
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Row 4 — shortcuts into the two pages HR lives in most */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
        <ShortcutCard
          title="Attendance review queue"
          description="2 flagged punches waiting on your decision."
          href="/dashboard/hr-admin/review"
        />
        <ShortcutCard
          title="Employee management"
          description="Onboard staff, manage devices and work-rule assignments."
          href="/dashboard/hr-admin/employees"
        />
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
  value: string;
  hint: string;
}) {
  return (
    // Icon in its own left column, all text stacked beside it — same
    // shape as the Team Lead and Super Admin cards.
    <div className="flex items-start gap-3 bg-surface border border-neutral/20 p-5 rounded-xl">
      <div
        className={`flex items-center justify-center h-9 w-9 rounded-lg shrink-0 ${tone}`}
      >
        <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-wide uppercase text-neutral">
          {label}
        </p>
        <p className="mt-1 text-[28px] leading-none font-semibold text-heading tabular-nums">
          {value}
        </p>
        <p className="mt-2 text-[12px] text-neutral">{hint}</p>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-neutral/20 p-5 rounded-xl">
      <h6 className="text-[15px] font-semibold text-heading">{title}</h6>
      <p className="text-[12px] text-neutral">{subtitle}</p>
      {children}
    </div>
  );
}

function LegendItem({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-[12px] text-neutral">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}

// Present / Late / Absent legend, shared by the two bar charts.
function Legend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-5 mt-4">
      {SERIES.map((series) => (
        <LegendItem
          key={series.key}
          className={series.dot}
          label={series.label}
        />
      ))}
    </div>
  );
}

// Two-line chart drawn as a plain SVG. The viewBox gives us a 0-100
// coordinate space to map percentages into directly; preserveAspectRatio
// "none" lets it stretch to the card width, and vector-effect keeps the
// stroke from stretching with it.
function TrendChart() {
  const VIEW_W = 600;
  const VIEW_H = 220;

  function toPoints(values: number[]) {
    return values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * VIEW_W;
        const y = VIEW_H - (value / 100) * VIEW_H;
        return `${x},${y}`;
      })
      .join(" ");
  }

  return (
    <div className="mt-6 flex gap-3">
      <div className="flex flex-col justify-between h-56 w-9 shrink-0 text-right text-[11px] text-neutral tabular-nums">
        {[100, 75, 50, 25, 0].map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>

      <div className="flex-1 min-w-0">
        <div className="relative h-56">
          <div className="absolute inset-0 flex flex-col justify-between">
            {[0, 1, 2, 3, 4].map((line) => (
              <div
                key={line}
                className="border-t border-dashed border-neutral/20"
              />
            ))}
          </div>

          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="none"
            className="relative h-full w-full overflow-visible"
          >
            <polyline
              points={toPoints(ATTENDANCE_RATE)}
              fill="none"
              vectorEffect="non-scaling-stroke"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="stroke-primary"
            />
            <polyline
              points={toPoints(LATENESS_RATE)}
              fill="none"
              vectorEffect="non-scaling-stroke"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="stroke-warning"
            />
          </svg>
        </div>

        <div className="flex justify-between mt-2 text-[12px] text-neutral">
          {MONTHS.map((month) => (
            <span key={month}>{month}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Donut drawn with a single circle per slice: stroke-dasharray sets how
// much of the ring that slice covers, stroke-dashoffset rotates it to
// start where the previous slice ended.
function TrustDonut() {
  const RADIUS = 70;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  let offset = 0;
  const slices = TRUST_OUTCOMES.map((outcome) => {
    const length = (outcome.value / 100) * CIRCUMFERENCE;
    const slice = { ...outcome, length, offset };
    offset += length;
    return slice;
  });

  return (
    <div className="mt-6 flex items-center justify-center h-56">
      <svg viewBox="0 0 200 200" className="h-full">
        {/* -90deg so the first slice starts at 12 o'clock rather than
            3 o'clock, which is where SVG angles begin. */}
        <g transform="rotate(-90 100 100)">
          {slices.map((slice) => (
            <circle
              key={slice.label}
              cx={100}
              cy={100}
              r={RADIUS}
              fill="none"
              strokeWidth={26}
              strokeDasharray={`${slice.length} ${CIRCUMFERENCE - slice.length}`}
              strokeDashoffset={-slice.offset}
              className={slice.stroke}
            >
              <title>{`${slice.label} · ${slice.value}%`}</title>
            </circle>
          ))}
        </g>
        <text
          x={100}
          y={96}
          textAnchor="middle"
          className="fill-heading text-[26px] font-semibold"
        >
          91%
        </text>
        <text
          x={100}
          y={118}
          textAnchor="middle"
          className="fill-neutral text-[11px]"
        >
          approved
        </text>
      </svg>
    </div>
  );
}

// `href` is null for destinations that don't exist yet — renders a
// disabled control instead of a link that would 404.
function ShortcutCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-4 bg-surface border border-neutral/20 p-5 rounded-xl">
      <div className="min-w-0">
        <h6 className="text-[15px] font-semibold text-heading">{title}</h6>
        <p className="text-[12px] text-neutral">{description}</p>
      </div>

      {href ? (
        <Link
          href={href}
          className="inline-flex items-center gap-2 rounded-md border border-neutral/30 px-4 py-2.5 text-sm font-medium text-heading hover:bg-neutral/10 shrink-0"
        >
          Open
          <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
        </Link>
      ) : (
        <button
          type="button"
          disabled
          title="The Review Queue page hasn't been built yet."
          className="inline-flex items-center gap-2 rounded-md border border-neutral/30 px-4 py-2.5 text-sm font-medium text-heading shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Open
          <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}
