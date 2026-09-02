"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right";

  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyMessage: ReactNode;

  renderCardHeader?: (row: T) => ReactNode;
  renderFooter?: () => ReactNode;

  pageSize?: number;
  itemLabel?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  emptyMessage,
  renderCardHeader,
  renderFooter,
  pageSize,
  itemLabel = "rows",
}: DataTableProps<T>) {
  const [page, setPage] = useState(1);

  const totalPages = pageSize
    ? Math.max(1, Math.ceil(rows.length / pageSize))
    : 1;

  // Searching or filtering shrinks the list; without this you can be
  // stranded on page 4 of a result set that now has one page, staring at
  // an empty table.
  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const visibleRows = useMemo(() => {
    if (!pageSize) return rows;
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  if (rows.length === 0) {
    return (
      <div className="bg-surface border border-neutral/20 rounded-xl px-5 py-10 text-center text-sm text-neutral">
        {emptyMessage}
      </div>
    );
  }

  const firstShown = pageSize ? (page - 1) * pageSize + 1 : 1;
  const lastShown = pageSize
    ? Math.min(page * pageSize, rows.length)
    : rows.length;

  const mobileColumns = columns.filter((column) => !column.hideOnMobile);

  return (
    <>
      {/* ---- lg and up: a real table ---- */}
      <div className="hidden lg:block bg-surface border border-neutral/20 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral/20">
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={`px-5 py-3 text-xs font-medium tracking-wide uppercase text-neutral whitespace-nowrap ${
                      column.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr
                  key={getRowKey(row)}
                  className="border-b border-neutral/10 last:border-0"
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-5 py-4 align-top ${
                        column.align === "right" ? "text-right" : "text-left"
                      }`}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {renderFooter && <tfoot>{renderFooter()}</tfoot>}
          </table>
        </div>
      </div>

      {/* ---- below lg: one card per row ---- */}
      <div className="lg:hidden space-y-3">
        {visibleRows.map((row) => (
          <div
            key={getRowKey(row)}
            className="bg-surface border border-neutral/20 rounded-xl p-4"
          >
            {renderCardHeader && (
              <div className="mb-3 pb-3 border-b border-neutral/10">
                {renderCardHeader(row)}
              </div>
            )}

            <dl className="space-y-2">
              {mobileColumns.map((column) => (
                <div
                  key={column.key}
                  className="flex items-start justify-between gap-4"
                >
                  <dt className="text-[12px] text-neutral shrink-0">
                    {column.header}
                  </dt>

                  <dd className="text-sm text-heading text-right min-w-0 wrap-break-word">
                    {column.render(row)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}

        {renderFooter && (
          <div className="bg-surface border border-neutral/20 rounded-xl p-4">
            <table className="w-full text-sm">
              <tbody>{renderFooter()}</tbody>
            </table>
          </div>
        )}
      </div>

      {pageSize && totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <p className="text-[12px] text-neutral tabular-nums">
            Showing {firstShown}–{lastShown} of {rows.length} {itemLabel}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
              className="inline-flex items-center gap-1 rounded-md border border-neutral/30 px-3 py-2 text-sm font-medium text-heading hover:bg-neutral/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
              Previous
            </button>
            <span className="text-[12px] text-neutral tabular-nums px-1">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              disabled={page === totalPages}
              className="inline-flex items-center gap-1 rounded-md border border-neutral/30 px-3 py-2 text-sm font-medium text-heading hover:bg-neutral/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
