"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth-store";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import { useToast } from "@/app/components/Toast";
import { HolidayModal } from "@/app/components/dashboard/HolidayModal";
import { ConfirmDialog } from "@/app/components/dashboard/ConfirmDialog";
import { extractErrorMessage } from "@/lib/api-client";
import {
  createHoliday,
  deleteHoliday,
  fetchHolidays,
  formatHolidayDate,
  updateHoliday,
  type Holiday,
  type HolidayInput,
} from "@/lib/holidays";

// The holiday calendar on real data (GET/POST/PATCH/DELETE /holidays,
// Phase 3). One year at a time, because that's how the API answers: a
// year's dated holidays plus every annual one, placed on its date in that
// year (`onDate`). Changes apply from the next punch — days already
// summarised aren't rewritten.

const THIS_YEAR = new Date().getFullYear();

export default function SuperAdminHolidaysPage() {
  const toast = useToast();
  const orgName =
    useAuthStore((state) => state.user?.organizationName) ?? "Your organization";
  const [year, setYear] = useState(THIS_YEAR);
  const [holidays, setHolidays] = useState<Holiday[] | null>(null);
  const [loadedYear, setLoadedYear] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"create" | Holiday | null>(null);
  const [deletingHoliday, setDeletingHoliday] = useState<Holiday | null>(null);

  usePageHeader("Holiday calendar", `${orgName} · ${year}`);

  const load = useCallback(() => {
    const requested = year;
    fetchHolidays(requested)
      .then((data) => {
        setHolidays(data);
        setLoadedYear(requested);
        setLoadError(null);
      })
      .catch((error) => setLoadError(extractErrorMessage(error)));
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  // While a different year is loading, don't show the previous year's list
  // under the new year's heading.
  const isLoading = loadedYear !== year && !loadError;

  async function handleSave(input: HolidayInput) {
    const editing = modalMode && modalMode !== "create" ? modalMode : null;
    // Throws on refusal — the modal catches it and shows the reason.
    if (editing) await updateHoliday(editing.id, input);
    else await createHoliday(input);
    toast.success(
      input.name + (editing ? " updated" : " added"),
      "Nobody is marked late or absent on this date."
    );
    load();
  }

  async function handleDelete(holiday: Holiday) {
    try {
      await deleteHoliday(holiday.id);
      toast.success(holiday.name + " deleted", "Attendance expectations apply on that date again.");
    } catch (error) {
      toast.error("Couldn't delete this holiday", extractErrorMessage(error));
    } finally {
      load();
    }
  }

  return (
    <div>
      <div className="bg-surface border border-neutral/20 rounded-xl overflow-hidden p-5">
        {/* A divider plus room below, so the toolbar reads as separate from
            the first holiday instead of sitting right on top of it. */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-2 border-b border-neutral/10">
          <div className="flex items-center gap-1" role="group" aria-label="Year">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              aria-label="Previous year"
              className="rounded-md p-2 text-neutral hover:bg-neutral/10 hover:text-heading"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-14 text-center text-sm font-semibold text-heading tabular-nums">
              {year}
            </span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              aria-label="Next year"
              className="rounded-md p-2 text-neutral hover:bg-neutral/10 hover:text-heading"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {year !== THIS_YEAR && (
              <button
                type="button"
                onClick={() => setYear(THIS_YEAR)}
                className="ml-1 text-xs font-medium text-primary hover:underline"
              >
                Back to {THIS_YEAR}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setModalMode("create")}
            className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2.5 rounded-md hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add holiday
          </button>
        </div>

        {loadError && (
          <div className="my-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-alert/30 bg-alert/10 px-4 py-3">
            <p className="min-w-0 text-sm text-alert wrap-break-word">
              Couldn&apos;t load holidays: {loadError}
            </p>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-2 text-sm font-medium text-heading hover:underline"
            >
              <RefreshCw className="h-4 w-4" strokeWidth={2} />
              Try again
            </button>
          </div>
        )}

        {isLoading ? (
          <p className="py-3 text-sm text-neutral">Loading holidays…</p>
        ) : holidays && holidays.length === 0 ? (
          <p className="py-3 text-sm text-neutral">
            No holidays in {year} yet. Add one and nobody is marked late or absent on it.
          </p>
        ) : (
          /* Stacks on phones. The old single row put a fixed-width date, a
             truncating name and a type badge on one line, so the name —
             the only part that identifies the holiday — was the first
             thing squeezed to nothing. */
          (holidays ?? []).map((holiday, index, all) => (
            <div
              key={holiday.id}
              className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-4 py-3 ${
                index !== all.length - 1 ? "border-b border-neutral/10" : ""
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:gap-6 min-w-0">
                {/* onDate, not date: an annual holiday shows on THIS year's
                    date, not the year it was first entered. */}
                <span className="text-sm text-neutral whitespace-nowrap sm:w-28 sm:shrink-0">
                  {formatHolidayDate(holiday.onDate)}
                </span>
                {/* wrap-break-word, not truncate: a long name wraps onto a
                    second line instead of disappearing behind an ellipsis. */}
                <span className="text-sm font-medium text-heading wrap-break-word min-w-0">
                  {holiday.name}
                </span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {holiday.repeatsAnnually && (
                  <span className="text-[11px] text-neutral whitespace-nowrap">Repeats yearly</span>
                )}
                <span className="text-xs font-medium tracking-wide uppercase text-neutral border-b border-neutral/30 pb-0.5">
                  {holiday.type}
                </span>
                <button
                  type="button"
                  onClick={() => setModalMode(holiday)}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingHoliday(holiday)}
                  className="text-sm font-medium text-alert hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {modalMode && (
        <HolidayModal
          holiday={modalMode === "create" ? undefined : modalMode}
          onClose={() => setModalMode(null)}
          onSave={handleSave}
        />
      )}

      {deletingHoliday && (
        <ConfirmDialog
          title={`Delete ${deletingHoliday.name}?`}
          description={
            deletingHoliday.repeatsAnnually
              ? "It repeats every year, so this removes it from every year — not just this one. Anyone who doesn't clock in on that date will count as absent."
              : "Attendance expectations will apply on that date again, and anyone who doesn't clock in will count as absent."
          }
          confirmLabel="Delete holiday"
          onConfirm={() => handleDelete(deletingHoliday)}
          onClose={() => setDeletingHoliday(null)}
        />
      )}
    </div>
  );
}
