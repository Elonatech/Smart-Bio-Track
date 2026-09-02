"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth-store";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import { useToast } from "@/app/components/Toast";
import {
  HolidayModal,
  type Holiday,
} from "@/app/components/dashboard/HolidayModal";
import { ConfirmDialog } from "@/app/components/dashboard/ConfirmDialog";

// repeatsAnnually is false for the moveable feasts — Eid follows the
// lunar calendar and Good Friday moves with Easter, so neither can be
// carried to the same date next year.
const INITIAL_HOLIDAYS: Holiday[] = [
  { id: "1", name: "New Year's Day", date: "2026-01-01", type: "PUBLIC", repeatsAnnually: true },
  { id: "2", name: "Eid al-Fitr (day 1)", date: "2026-03-20", type: "PUBLIC", repeatsAnnually: false },
  { id: "3", name: "Good Friday", date: "2026-04-03", type: "PUBLIC", repeatsAnnually: false },
  { id: "4", name: "Workers' Day", date: "2026-05-01", type: "PUBLIC", repeatsAnnually: true },
  { id: "5", name: "Democracy Day", date: "2026-06-12", type: "PUBLIC", repeatsAnnually: true },
  { id: "6", name: "Independence Day", date: "2026-10-01", type: "PUBLIC", repeatsAnnually: true },
  { id: "7", name: "Company closure", date: "2026-12-24", type: "COMPANY", repeatsAnnually: false },
];

function formatDate(iso: string) {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function SuperAdminHolidaysPage() {
  const toast = useToast();
  const orgName =
    useAuthStore((state) => state.user?.organizationName) ??
    "Your organization";
  const [holidays, setHolidays] = useState<Holiday[]>(INITIAL_HOLIDAYS);
  const [modalMode, setModalMode] = useState<"create" | Holiday | null>(null);
  const [deletingHoliday, setDeletingHoliday] = useState<Holiday | null>(null);

  usePageHeader("Holiday calendar", `${orgName} · 2026`);

  function handleSave(values: Omit<Holiday, "id">) {
    const isEdit = Boolean(modalMode && modalMode !== "create");

    if (modalMode && modalMode !== "create") {
      const editingId = modalMode.id;
      setHolidays((prev) =>
        prev
          .map((holiday) =>
            holiday.id === editingId ? { ...values, id: editingId } : holiday
          )
          .sort((a, b) => a.date.localeCompare(b.date))
      );
    } else {
      setHolidays((prev) =>
        [...prev, { ...values, id: crypto.randomUUID() }].sort((a, b) =>
          a.date.localeCompare(b.date)
        )
      );
    }

    toast.success(
      values.name + (isEdit ? " updated successfully" : " added successfully"),
      "Shown on the calendar only — holidays are not saved to the server yet."
    );
  }

  function handleDelete(holiday: Holiday) {
    setHolidays((prev) => prev.filter((existing) => existing.id !== holiday.id));
    toast.success(
      holiday.name + " deleted successfully",
      "Attendance expectations apply on that date again."
    );
  }

  return (
    <div className="">
      <div className="bg-surface border border-neutral/20 rounded-xl overflow-hidden p-5">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setModalMode("create")}
            className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2.5 rounded-md hover:bg-primary/90 mb-2"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add holiday
          </button>
        </div>
        {/* Stacks on phones. The old single row put a fixed-width date, a
            truncating name and a type badge on one line, so the name —
            the only part that identifies the holiday — was the first
            thing squeezed to nothing. */}
        {holidays.map((holiday, index) => (
          <div
            key={holiday.id}
            className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-4 py-3 ${
              index !== holidays.length - 1 ? "border-b border-neutral/10" : ""
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-6 min-w-0">
              <span className="text-sm text-neutral whitespace-nowrap sm:w-28 sm:shrink-0">
                {formatDate(holiday.date)}
              </span>
              {/* break-words, not truncate: a long name wraps onto a
                  second line instead of disappearing behind an ellipsis. */}
              <span className="text-sm font-medium text-heading break-words min-w-0">
                {holiday.name}
              </span>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {/* Otherwise the modal's repeat toggle would vanish the
                  moment you save — nothing on the page would show what
                  you set. */}
              {holiday.repeatsAnnually && (
                <span className="text-[11px] text-neutral whitespace-nowrap">
                  Repeats yearly
                </span>
              )}
              <span className="text-xs font-medium tracking-wide uppercase text-neutral border-b border-neutral/30 pb-0.5">
                {holiday.type}
              </span>

              {/* Every holiday can now be corrected or removed — a date
                  typed wrong was previously permanent for the session. */}
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
        ))}
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
          description="Attendance expectations will apply on that date again, and anyone who does not clock in will count as absent."
          note="Removed from this screen only — holidays are not saved to the server yet."
          confirmLabel="Delete holiday"
          onConfirm={() => handleDelete(deletingHoliday)}
          onClose={() => setDeletingHoliday(null)}
        />
      )}
    </div>
  );
}
