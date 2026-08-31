"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { appClient } from "@/lib/api-client";
import { downloadCsv } from "@/lib/csv";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import type { Office } from "@/app/components/dashboard/OfficeFormModal";

// Attendance reporting for HR. UI only — there's no Attendance model in
// prisma/schema.prisma and no reports endpoint, so the rows are example
// data. The date range, office filter and CSV export are all genuinely
// wired to that local data though, so the page behaves like the real
// thing rather than being a static picture.

interface DepartmentRow {
  department: string;
  office: string;
  presentPct: number;
  latePct: number;
  absentPct: number;
  totalHours: number;
}

const DEPARTMENT_ROWS: DepartmentRow[] = [
  {
    department: "Engineering",
    office: "Lagos HQ",
    presentPct: 92.4,
    latePct: 5.1,
    absentPct: 2.5,
    totalHours: 1842,
  },
  {
    department: "Sales",
    office: "Lagos HQ",
    presentPct: 88.1,
    latePct: 8.6,
    absentPct: 3.3,
    totalHours: 1510,
  },
  {
    department: "Operations",
    office: "Abuja Office",
    presentPct: 94.7,
    latePct: 3.2,
    absentPct: 2.1,
    totalHours: 1984,
  },
  {
    department: "Finance",
    office: "Lagos HQ",
    presentPct: 96.2,
    latePct: 2.4,
    absentPct: 1.4,
    totalHours: 1120,
  },
  {
    department: "Customer Support",
    office: "Abuja Office",
    presentPct: 90.3,
    latePct: 6.9,
    absentPct: 2.8,
    totalHours: 1704,
  },
];

// The office list is REAL — fetched from GET /offices, which is a live
// endpoint (apps/api/src/offices/office.controller.ts) scoped to the
// caller's organization. Only the attendance figures above are example
// data. Sentinel value for "don't filter"; a real office name could
// never collide with it because it isn't an office name.
const ALL_OFFICES = "All offices";

// Columns are declared once and drive the header, the body and the CSV
// export, so a new column can't end up in the table but missing from the
// download.
const COLUMNS = [
  { key: "presentPct", label: "Present %", tone: "text-success" },
  { key: "latePct", label: "Late %", tone: "text-warning" },
  { key: "absentPct", label: "Absent %", tone: "text-alert" },
] as const;

// "2026-08-01" -> "1 August 2026". Date inputs hand back ISO strings;
// the header should read like prose.
function formatIsoDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function HRAdminReportsPage() {
  const [fromDate, setFromDate] = useState("2026-08-01");
  const [toDate, setToDate] = useState("2026-08-10");
  const [office, setOffice] = useState(ALL_OFFICES);
  const [offices, setOffices] = useState<Office[]>([]);
  const [officesError, setOfficesError] = useState<string | null>(null);

  useEffect(() => {
    // Same fetch the Offices page uses. A failure isn't fatal here —
    // the report still renders, you just can't narrow it by office.
    let isActive = true;
    appClient
      .get<Office[]>("/offices")
      .then((res) => {
        if (isActive) setOffices(res.data);
      })
      .catch(() => {
        if (isActive) setOfficesError("Couldn't load your offices.");
      });
    return () => {
      isActive = false;
    };
  }, []);

  usePageHeader(
    "Reports",
    `${formatIsoDate(fromDate)} – ${formatIsoDate(toDate)} · ${office.toLowerCase()}`
  );

  const rows = useMemo(
    () =>
      office === ALL_OFFICES
        ? DEPARTMENT_ROWS
        : DEPARTMENT_ROWS.filter((row) => row.office === office),
    [office]
  );

  // Hours simply sum; the percentages are weighted by each department's
  // hours, because a straight average would let a 40-hour department
  // swing the org-wide figure as hard as a 2,000-hour one.
  const totals = useMemo(() => {
    const totalHours = rows.reduce((sum, row) => sum + row.totalHours, 0);
    if (totalHours === 0) {
      return { totalHours: 0, presentPct: 0, latePct: 0, absentPct: 0 };
    }
    const weighted = (pick: (row: DepartmentRow) => number) =>
      rows.reduce((sum, row) => sum + pick(row) * row.totalHours, 0) /
      totalHours;

    return {
      totalHours,
      presentPct: weighted((row) => row.presentPct),
      latePct: weighted((row) => row.latePct),
      absentPct: weighted((row) => row.absentPct),
    };
  }, [rows]);

  // Exports exactly what's on screen — same office filter, same rows,
  // same weighted totals row.
  function handleExportCsv() {
    downloadCsv(`attendance-report-${fromDate}-to-${toDate}.csv`, [
      [
        "Department",
        "Office",
        "Present %",
        "Late %",
        "Absent %",
        "Total hours",
      ],
      ...rows.map((row) => [
        row.department,
        row.office,
        row.presentPct,
        row.latePct,
        row.absentPct,
        row.totalHours,
      ]),
      [
        "All departments",
        office,
        totals.presentPct.toFixed(1),
        totals.latePct.toFixed(1),
        totals.absentPct.toFixed(1),
        totals.totalHours,
      ],
    ]);
  }

  const isRangeValid = fromDate <= toDate;

  return (
    <div className="pb-8">
      <div className="bg-surface border border-neutral/20 rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <h6 className="text-[15px] font-semibold text-heading">
            Department summary
          </h6>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={office}
              onChange={(event) => setOffice(event.target.value)}
              aria-label="Filter by office"
              className="rounded-md border border-neutral/40 px-3 py-2 text-sm text-heading bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value={ALL_OFFICES}>{ALL_OFFICES}</option>
              {offices.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              aria-label="From date"
              className="rounded-md border border-neutral/40 px-3 py-2 text-sm text-heading bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              aria-label="To date"
              className="rounded-md border border-neutral/40 px-3 py-2 text-sm text-heading bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-2 rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="h-4 w-4" strokeWidth={1.75} />
              Export CSV
            </button>
          </div>
        </div>

        {!isRangeValid && (
          <p className="px-5 pb-3 text-sm text-alert">
            The start date is after the end date.
          </p>
        )}

        {officesError && (
          <p className="px-5 pb-3 text-sm text-alert">{officesError}</p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-neutral/20">
                <th className="text-left px-5 py-3 text-xs font-medium tracking-wide uppercase text-neutral">
                  Department
                </th>
                {COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    className={`text-right px-5   text-xs font-medium tracking-wide uppercase ${column.tone}`}
                  >
                    {column.label}
                  </th>
                ))}
                <th className="text-right px-5 py-3 text-xs font-medium tracking-wide uppercase text-neutral">
                  Total hours
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.department}
                  className="border-b border-neutral/10 last:border-0"
                >
                  <td className="px-5 py-2 font-medium text-heading whitespace-nowrap">
                    {row.department}
                    {office === ALL_OFFICES && (
                      <span className="block text-[12px] font-normal text-neutral">
                        {row.office}
                      </span>
                    )}
                  </td>
                  {COLUMNS.map((column) => (
                    <td
                      key={column.key}
                      className={`px-5 py-4 text-right tabular-nums ${column.tone}`}
                    >
                      {row[column.key].toFixed(1)}%
                    </td>
                  ))}
                  <td className="px-5 py-4 text-right text-heading tabular-nums">
                    {row.totalHours.toLocaleString("en-GB")}
                  </td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={COLUMNS.length + 2}
                    className="px-5 py-10 text-center text-sm text-neutral"
                  >
                    No attendance recorded at {office} in this range.
                    <span className="block mt-1 text-[12px]">
                      The office list is live, but the figures above are still
                      example data and aren&apos;t linked to your real offices
                      yet.
                    </span>
                  </td>
                </tr>
              )}
            </tbody>

            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-neutral/20 bg-background/60">
                  <td className="px-5 py-4 font-semibold text-heading whitespace-nowrap">
                    All departments
                    <span className="block text-[12px] font-normal text-neutral">
                      Weighted by hours
                    </span>
                  </td>
                  {COLUMNS.map((column) => (
                    <td
                      key={column.key}
                      className={`px-5 py-4 text-right font-semibold tabular-nums ${column.tone}`}
                    >
                      {totals[column.key].toFixed(1)}%
                    </td>
                  ))}
                  <td className="px-5 py-4 text-right font-semibold text-heading tabular-nums">
                    {totals.totalHours.toLocaleString("en-GB")}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
