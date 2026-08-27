"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { downloadCsv } from "@/lib/csv";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";

// Payroll hand-off for HR. UI only — there's no Attendance model in
// prisma/schema.prisma and no payroll endpoint, so the rows are example
// data. The CSV export is real and builds from what's on screen.
//
// "Verified hours" is the point of this page: only punches that passed
// the trust engine (or were approved in the Review Queue) count towards
// pay, which is why it's a separate figure from raw clocked hours.

interface PayrollRow {
  employeeId: string;
  name: string;
  verifiedHours: number;
  overtimeHours: number;
  deductions: number;
  grossPay: number;
}

const PAYROLL_ROWS: PayrollRow[] = [
  {
    employeeId: "EMP-1042",
    name: "Chinedu Okafor",
    verifiedHours: 168,
    overtimeHours: 6,
    deductions: 0,
    grossPay: 640000,
  },
  {
    employeeId: "EMP-1077",
    name: "Aisha Bello",
    verifiedHours: 162,
    overtimeHours: 0,
    deductions: 12000,
    grossPay: 585000,
  },
  {
    employeeId: "EMP-1103",
    name: "Tunde Adeyemi",
    verifiedHours: 171,
    overtimeHours: 11,
    deductions: 0,
    grossPay: 712500,
  },
  {
    employeeId: "EMP-1156",
    name: "Ngozi Eze",
    verifiedHours: 156,
    overtimeHours: 0,
    deductions: 24000,
    grossPay: 498000,
  },
  {
    employeeId: "EMP-1188",
    name: "Ibrahim Musa",
    verifiedHours: 168,
    overtimeHours: 4,
    deductions: 0,
    grossPay: 604000,
  },
];

// Cycles an admin can hand off. Newest first — payroll is almost always
// run for the cycle that just closed.
const CYCLES = [
  { value: "2026-08", label: "August 2026" },
  { value: "2026-07", label: "July 2026" },
  { value: "2026-06", label: "June 2026" },
];

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

export default function HRAdminPayrollPage() {
  const [cycle, setCycle] = useState(CYCLES[0].value);

  const cycleLabel =
    CYCLES.find((option) => option.value === cycle)?.label ?? CYCLES[0].label;

  usePageHeader(
    "Payroll export",
    `${cycleLabel} cycle · only approved punches are included`
  );

  // Every numeric column is totalled, not just gross pay — an admin
  // reconciling against a payroll system needs the hours and deductions
  // to tie out too, not only the money.
  const totals = useMemo(
    () =>
      PAYROLL_ROWS.reduce(
        (running, row) => ({
          verifiedHours: running.verifiedHours + row.verifiedHours,
          overtimeHours: running.overtimeHours + row.overtimeHours,
          deductions: running.deductions + row.deductions,
          grossPay: running.grossPay + row.grossPay,
        }),
        { verifiedHours: 0, overtimeHours: 0, deductions: 0, grossPay: 0 }
      ),
    []
  );

  function handleExport() {
    // Raw numbers, not the formatted "₦640,000" on screen — a spread-
    // sheet can sum 640000, but treats the formatted string as text.
    downloadCsv(`payroll-${cycle}.csv`, [
      [
        "Employee ID",
        "Name",
        "Verified hours",
        "Overtime hours",
        "Deductions (NGN)",
        "Gross pay (NGN)",
      ],
      ...PAYROLL_ROWS.map((row) => [
        row.employeeId,
        row.name,
        row.verifiedHours,
        row.overtimeHours,
        row.deductions,
        row.grossPay,
      ]),
      [
        "TOTAL",
        `${PAYROLL_ROWS.length} employees`,
        totals.verifiedHours,
        totals.overtimeHours,
        totals.deductions,
        totals.grossPay,
      ],
    ]);
  }

  return (
    <div className="pb-8">
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
              Export payroll CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-neutral/20">
                <th className="text-left px-5 py-3 text-xs font-medium tracking-wide uppercase text-neutral">
                  Employee
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium tracking-wide uppercase text-neutral">
                  ID
                </th>
                <th className="text-right px-5 py-3 text-xs font-medium tracking-wide uppercase text-neutral">
                  Verified hours
                </th>
                <th className="text-right px-5 py-3 text-xs font-medium tracking-wide uppercase text-neutral">
                  Overtime
                </th>
                <th className="text-right px-5 py-3 text-xs font-medium tracking-wide uppercase text-neutral">
                  Deductions
                </th>
                <th className="text-right px-5 py-3 text-xs font-medium tracking-wide uppercase text-neutral">
                  Gross pay
                </th>
              </tr>
            </thead>

            <tbody>
              {PAYROLL_ROWS.map((row) => (
                <tr
                  key={row.employeeId}
                  className="border-b border-neutral/10 last:border-0"
                >
                  <td className="px-5 py-4 font-medium text-heading whitespace-nowrap">
                    {row.name}
                  </td>
                  <td className="px-5 py-4 text-neutral whitespace-nowrap">
                    {row.employeeId}
                  </td>
                  <td className="px-5 py-4 text-right text-heading tabular-nums">
                    {row.verifiedHours}h
                  </td>
                  {/* Zero overtime is muted rather than bold — it's the
                      normal case, and only the non-zero ones matter. */}
                  <td
                    className={`px-5 py-4 text-right tabular-nums ${
                      row.overtimeHours > 0 ? "text-heading" : "text-neutral"
                    }`}
                  >
                    {row.overtimeHours}h
                  </td>
                  <td
                    className={`px-5 py-4 text-right tabular-nums ${
                      row.deductions > 0 ? "text-alert" : "text-neutral"
                    }`}
                  >
                    {row.deductions > 0 ? naira.format(row.deductions) : "—"}
                  </td>
                  <td className="px-5 py-4 text-right font-medium text-heading tabular-nums">
                    {naira.format(row.grossPay)}
                  </td>
                </tr>
              ))}

              {PAYROLL_ROWS.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-sm text-neutral"
                  >
                    No verified hours in the {cycleLabel} cycle.
                  </td>
                </tr>
              )}
            </tbody>

            {PAYROLL_ROWS.length > 0 && (
              <tfoot>
                <tr className="border-t border-neutral/20 bg-background/60">
                  <td className="px-5 py-4 font-semibold text-heading whitespace-nowrap">
                    Total
                    <span className="block text-[12px] font-normal text-neutral">
                      {PAYROLL_ROWS.length} employees
                    </span>
                  </td>
                  <td className="px-5 py-4" />
                  <td className="px-5 py-4 text-right font-semibold text-heading tabular-nums">
                    {totals.verifiedHours}h
                  </td>
                  <td className="px-5 py-4 text-right font-semibold text-heading tabular-nums">
                    {totals.overtimeHours}h
                  </td>
                  <td className="px-5 py-4 text-right font-semibold text-alert tabular-nums">
                    {totals.deductions > 0
                      ? naira.format(totals.deductions)
                      : "—"}
                  </td>
                  <td className="px-5 py-4 text-right font-semibold text-heading tabular-nums">
                    {naira.format(totals.grossPay)}
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
