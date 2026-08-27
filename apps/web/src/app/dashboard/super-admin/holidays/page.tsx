"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth-store";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import {
  HolidayModal,
  type Holiday,
} from "@/app/components/dashboard/HolidayModal";

const INITIAL_HOLIDAYS: Holiday[] = [
  { id: "1", name: "New Year's Day", date: "2026-01-01", type: "PUBLIC" },
  { id: "2", name: "Eid al-Fitr (day 1)", date: "2026-03-20", type: "PUBLIC" },
  { id: "3", name: "Good Friday", date: "2026-04-03", type: "PUBLIC" },
  { id: "4", name: "Workers' Day", date: "2026-05-01", type: "PUBLIC" },
  { id: "5", name: "Democracy Day", date: "2026-06-12", type: "PUBLIC" },
  { id: "6", name: "Independence Day", date: "2026-10-01", type: "PUBLIC" },
  { id: "7", name: "Company closure", date: "2026-12-24", type: "COMPANY" },
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
  const orgName =
    useAuthStore((state) => state.user?.organizationName) ??
    "Your organization";
  const [holidays, setHolidays] = useState<Holiday[]>(INITIAL_HOLIDAYS);
  const [isModalOpen, setIsModalOpen] = useState(false);

  usePageHeader("Holiday calendar", `${orgName} · 2026`);

  function handleSave(values: Omit<Holiday, "id">) {
    setHolidays((prev) =>
      [...prev, { ...values, id: crypto.randomUUID() }].sort((a, b) =>
        a.date.localeCompare(b.date)
      )
    );
  }

  return (
    <div className="">
      <div className="bg-surface border border-neutral/20 rounded-xl overflow-hidden p-5">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2.5 rounded-md hover:bg-primary/90 mb-2"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add holiday
          </button>
        </div>
        {holidays.map((holiday, index) => (
          <div
            key={holiday.id}
            className={`flex items-center justify-between py-3 ${
              index !== holidays.length - 1 ? "border-b border-neutral/10" : ""
            }`}
          >
            <div className="flex items-center gap-6 min-w-0">
              <span className="text-sm text-neutral whitespace-nowrap w-28 shrink-0">
                {formatDate(holiday.date)}
              </span>
              <span className="text-sm font-medium text-heading truncate">
                {holiday.name}
              </span>
            </div>
            <span className="text-xs font-medium tracking-wide uppercase text-neutral border-b border-neutral/30 pb-0.5 shrink-0 ml-4">
              {holiday.type}
            </span>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <HolidayModal
          onClose={() => setIsModalOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
