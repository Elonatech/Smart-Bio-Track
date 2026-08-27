"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth-store";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import {
  WorkRuleFormModal,
  type WorkRule,
} from "@/app/components/dashboard/WorkRuleFormModal";

const INITIAL_RULES: WorkRule[] = [
  {
    id: "1",
    name: "Standard Corporate",
    startTime: "08:00",
    endTime: "17:00",
    days: "Mon–Fri",
    gracePeriodMinutes: 15,
    breakMinutes: 60,
    overtimeAfterHours: 9,
  },
  {
    id: "2",
    name: "Night Shift (Ops)",
    startTime: "20:00",
    endTime: "05:00",
    days: "Sun–Thu",
    gracePeriodMinutes: 10,
    breakMinutes: 45,
    overtimeAfterHours: 9,
  },
  {
    id: "3",
    name: "Field Team",
    startTime: "07:30",
    endTime: "16:30",
    days: "Mon–Sat",
    gracePeriodMinutes: 20,
    breakMinutes: 60,
    overtimeAfterHours: 8,
  },
];

export default function SuperAdminWorkRulesPage() {
  const orgName =
    useAuthStore((state) => state.user?.organizationName) ??
    "Your organization";
  const [rules, setRules] = useState<WorkRule[]>(INITIAL_RULES);
  const [modalMode, setModalMode] = useState<"create" | WorkRule | null>(null);

  usePageHeader(
    "Work rules",
    `${orgName} · applied per employee or department`
  );

  function handleSave(values: Omit<WorkRule, "id">) {
    if (modalMode && modalMode !== "create") {
      const editingId = modalMode.id;
      setRules((prev) =>
        prev.map((rule) =>
          rule.id === editingId ? { ...values, id: editingId } : rule
        )
      );
    } else {
      setRules((prev) => [...prev, { ...values, id: crypto.randomUUID() }]);
    }
  }

  return (
    <div>
      <div className="bg-surface border border-neutral/20 rounded-xl overflow-hidden p-5">
        <div className="flex justify-end  ">
          <button
            type="button"
            onClick={() => setModalMode("create")}
            className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2.5 rounded-md hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            New work rule
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral/20">
                <th className="text-left  py-3 text-[14px] font-medium tracking-wide uppercase text-neutral">
                  Rule
                </th>
                <th className="text-left  py-3 text-[14px] font-medium tracking-wide uppercase text-neutral">
                  Shift window
                </th>
                <th className="text-left  py-3 text-[14px] font-medium tracking-wide uppercase text-neutral">
                  Grace period
                </th>
                <th className="text-left  py-3 text-[14px] font-medium tracking-wide uppercase text-neutral">
                  Break
                </th>
                <th className="text-left  py-3 text-[14px] font-medium tracking-wide uppercase text-neutral">
                  Overtime
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr
                  key={rule.id}
                  className="border-b border-neutral/20 last:border-0"
                >
                  <td className=" py-4 font-semibold text-heading whitespace-nowrap">
                    {rule.name}
                  </td>
                  <td className=" py-4 text-neutral whitespace-nowrap">
                    {rule.startTime} – {rule.endTime}, {rule.days}
                  </td>
                  <td className=" py-4 font-medium text-heading whitespace-nowrap">
                    {rule.gracePeriodMinutes} min
                  </td>
                  <td className=" py-4 font-medium text-heading whitespace-nowrap">
                    {rule.breakMinutes} min
                  </td>
                  <td className=" py-4 font-medium text-heading whitespace-nowrap">
                    After {rule.overtimeAfterHours} h
                  </td>
                  <td className=" py-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setModalMode(rule)}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalMode && (
        <WorkRuleFormModal
          rule={modalMode === "create" ? undefined : modalMode}
          onClose={() => setModalMode(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
