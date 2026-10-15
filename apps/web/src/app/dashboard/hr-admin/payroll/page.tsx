"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { downloadCsv } from "@/lib/csv";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import { useToast } from "@/app/components/Toast";
import { DataTable } from "@/app/components/dashboard/DataTable";
import { SampleDataBanner } from "@/app/components/dashboard/SampleDataBanner";

// Payroll hand-off for HR. UI only — there's no Attendance model in
// prisma/schema.prisma and no payroll endpoint, so the rows are example
// data. The CSV export is real and builds from what's on screen.
//
// HOURS, not pay — on purpose. This page used to show "deductions" and
// "gross pay" too, which made it look like the product runs payroll. It
// doesn't and shouldn't: turning hours into pay means each person's rate
// plus tax, pension and other deductions, which is what the client's own
// payroll software is for (and salary is sensitive data we have no reason
// to store). What a payroll tool needs from us is clean, verified hours,
// with overtime split by rate so it can apply its own pay rules.
//
// "Verified hours" is the point of this page: only punches that passed
// the trust engine (or were approved in the Review Queue) count, which is
// why it's a separate figure from raw clocked hours.

// The overtime rates a work rule can use (see StepWorkRules.tsx). The CSV
// gets one column per rate so a payroll tool can pay each at its own rate.
const OVERTIME_RATES = [1, 1.5, 2, 3] as const;
type OvertimeRate = (typeof OVERTIME_RATES)[number];

interface PayrollRow {
  employeeId: string;
  name: string;
  /** Everything worked and approved: regular plus overtime. */
  totalHours: number;
  /** Overtime hours, keyed by the rate they are paid at. Absent = none. */
  overtime: Partial<Record<OvertimeRate, number>>;
}

const PAYROLL_ROWS: PayrollRow[] = [
  { employeeId: "EMP-1042", name: "Chinedu Okafor", totalHours: 168, overtime: { 1.5: 4, 2: 2 } },
  { employeeId: "EMP-1077", name: "Aisha Bello", totalHours: 162, overtime: {} },
  { employeeId: "EMP-1103", name: "Tunde Adeyemi", totalHours: 171, overtime: { 1.5: 8, 2: 3 } },
  { employeeId: "EMP-1156", name: "Ngozi Eze", totalHours: 156, overtime: {} },
  { employeeId: "EMP-1188", name: "Ibrahim Musa", totalHours: 168, overtime: { 1.5: 4 } },
];

const overtimeTotal = (row: PayrollRow) =>
  OVERTIME_RATES.reduce((sum, rate) => sum + (row.overtime[rate] ?? 0), 0);
const regularHours = (row: PayrollRow) => row.totalHours - overtimeTotal(row);
// Only the CSV uses this: one column per rate, so a payroll tool that pays
// overtime at different rates can tell them apart. The screen shows just the
// overtime total — splitting it out there was clutter, since all of it is
// paid either way.
const rateLabel = (rate: OvertimeRate) => `x${rate.toFixed(1)}`;

// Cycles an admin can hand off. Newest first — payroll is almost always
// run for the cycle that just closed.
const CYCLES = [
  { value: "2026-08", label: "August 2026" },
  { value: "2026-07", label: "July 2026" },
  { value: "2026-06", label: "June 2026" },
];

export default function HRAdminPayrollPage() {
  const toast = useToast();
  const [cycle, setCycle] = useState(CYCLES[0].value);

  const cycleLabel =
    CYCLES.find((option) => option.value === cycle)?.label ?? CYCLES[0].label;

  usePageHeader(
    "Payroll export",
    `${cycleLabel} cycle · only approved punches are included`
  );

  // Every numeric column is totalled — an admin reconciling against a
  // payroll system needs the hours to tie out column by column.
  const totals = useMemo(() => {
    const byRate = Object.fromEntries(
      OVERTIME_RATES.map((rate) => [
        rate,
        PAYROLL_ROWS.reduce((sum, row) => sum + (row.overtime[rate] ?? 0), 0),
      ])
    ) as Record<OvertimeRate, number>;

    return {
      totalHours: PAYROLL_ROWS.reduce((sum, row) => sum + row.totalHours, 0),
      regularHours: PAYROLL_ROWS.reduce((sum, row) => sum + regularHours(row), 0),
      overtimeHours: PAYROLL_ROWS.reduce((sum, row) => sum + overtimeTotal(row), 0),
      byRate,
    };
  }, []);

  function handleExport() {
    // Raw numbers, not the "168h" on screen — a spreadsheet can sum 168
    // but treats "168h" as text.
    downloadCsv(`payroll-hours-${cycle}.csv`, [
      [
        "Employee ID",
        "Name",
        "Total hours",
        "Regular hours",
        "Overtime hours",
        ...OVERTIME_RATES.map((rate) => `Overtime ${rateLabel(rate)} (hours)`),
      ],
      ...PAYROLL_ROWS.map((row) => [
        row.employeeId,
        row.name,
        row.totalHours,
        regularHours(row),
        overtimeTotal(row),
        ...OVERTIME_RATES.map((rate) => row.overtime[rate] ?? 0),
      ]),
      [
        "TOTAL",
        `${PAYROLL_ROWS.length} employees`,
        totals.totalHours,
        totals.regularHours,
        totals.overtimeHours,
        ...OVERTIME_RATES.map((rate) => totals.byRate[rate]),
      ],
    ]);
    toast.success(
      "Hours exported successfully",
      PAYROLL_ROWS.length + " employees saved as CSV for the " + cycleLabel + " cycle."
    );
  }

  return (
    <div>
      <SampleDataBanner describes="payroll runs" />
      <div className="bg-surface border border-neutral/20 rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h6 className="text-[15px] font-semibold text-heading">
              Verified hours
            </h6>
            <p className="text-[12px] text-neutral">
              Flagged punches are excluded until they&apos;re approved in the
              review queue
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={cycle}
              onChange={(event) => setCycle(event.target.value)}
              aria-label="Payroll cycle"
              className="rounded-md border border-neutral/40 px-3 py-2 text-sm text-heading bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {CYCLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleExport}
              disabled={PAYROLL_ROWS.length === 0}
              className="inline-flex items-center gap-2 rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="h-4 w-4" strokeWidth={1.75} />
              Export hours CSV
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <DataTable
          rows={PAYROLL_ROWS}
          getRowKey={(row) => row.employeeId}
          emptyMessage={`No verified hours in the ${cycleLabel} cycle.`}
          pageSize={15}
          itemLabel="employees"
          renderCardHeader={(row) => (
            <div className="min-w-0">
              <p className="font-semibold text-heading break-words">
                {row.name}
              </p>
              <p className="text-[12px] text-neutral">{row.employeeId}</p>
            </div>
          )}
          renderFooter={() => (
            <tr className="border-t border-neutral/20 bg-background/60">
              <td className="px-5 py-4 font-semibold text-heading whitespace-nowrap">
                Total
                <span className="block text-[12px] font-normal text-neutral">
                  {PAYROLL_ROWS.length} employees
                </span>
              </td>
              <td className="px-5 py-4 hidden lg:table-cell" />
              <td className="px-5 py-4 font-semibold text-heading tabular-nums">
                {totals.totalHours}h
              </td>
              <td className="px-5 py-4 font-semibold text-heading tabular-nums">
                {totals.regularHours}h
              </td>
              <td className="px-5 py-4 font-semibold text-heading tabular-nums">
                {totals.overtimeHours}h
              </td>
            </tr>
          )}
          columns={[
            // Five equal shares, so the gaps between columns are even
            // instead of following however wide each column's content is.
            {
              key: "name",
              header: "Employee",
              widthClass: "w-1/5",
              hideOnMobile: true,
              render: (row) => (
                <span className="font-medium text-heading whitespace-nowrap">
                  {row.name}
                </span>
              ),
            },
            {
              key: "employeeId",
              header: "ID",
              widthClass: "w-1/5",
              hideOnMobile: true,
              render: (row) => (
                <span className="text-neutral whitespace-nowrap">
                  {row.employeeId}
                </span>
              ),
            },
            {
              key: "totalHours",
              header: "Total hours",
              widthClass: "w-1/5",
              render: (row) => (
                <span className="text-heading tabular-nums">
                  {row.totalHours}h
                </span>
              ),
            },
            {
              key: "regularHours",
              header: "Regular",
              widthClass: "w-1/5",
              render: (row) => (
                <span className="text-heading tabular-nums">
                  {regularHours(row)}h
                </span>
              ),
            },
            {
              key: "overtime",
              header: "Overtime",
              widthClass: "w-1/5",
              render: (row) => {
                const total = overtimeTotal(row);
                return (
                  <span
                    className={`tabular-nums ${
                      total > 0 ? "text-heading" : "text-neutral"
                    }`}
                  >
                    {total}h
                  </span>
                );
              },
            },
          ]}
        />
      </div>
    </div>
  );
}
