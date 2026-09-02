"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth-store";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import { useToast } from "@/app/components/Toast";
import { DataTable } from "@/app/components/dashboard/DataTable";
import { ConfirmDialog } from "@/app/components/dashboard/ConfirmDialog";
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
  const toast = useToast();
  const orgName =
    useAuthStore((state) => state.user?.organizationName) ??
    "Your organization";
  const [rules, setRules] = useState<WorkRule[]>(INITIAL_RULES);
  const [modalMode, setModalMode] = useState<"create" | WorkRule | null>(null);
  const [deletingRule, setDeletingRule] = useState<WorkRule | null>(null);

  function handleDelete(rule: WorkRule) {
    setRules((prev) => prev.filter((existing) => existing.id !== rule.id));
    toast.success(
      `${rule.name} deleted successfully`,
      "Removed from this screen only — work rules are not saved to the server yet."
    );
  }

  usePageHeader(
    "Work rules",
    `${orgName} · applied per employee or department`
  );

  function handleSave(values: Omit<WorkRule, "id">) {
    const isEdit = Boolean(modalMode && modalMode !== "create");
    toast.success(
      values.name + (isEdit ? " updated successfully" : " created successfully"),
      "Applied on this screen only — work rules are not saved to the server yet."
    );

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
      <div className="flex justify-end mb-6">
        <button
          type="button"
          onClick={() => setModalMode("create")}
          className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2.5 rounded-md hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          New work rule
        </button>
      </div>

      <DataTable
        rows={rules}
        getRowKey={(rule) => rule.id}
        emptyMessage="No work rules yet."
        renderCardHeader={(rule) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-heading break-words">
                {rule.name}
              </p>
              <p className="text-[12px] text-neutral">
                {rule.startTime} – {rule.endTime}, {rule.days}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setModalMode(rule)}
              className="text-sm font-medium text-primary hover:underline shrink-0"
            >
              Edit
            </button>
          </div>
        )}
        columns={[
          {
            key: "name",
            header: "Rule",
            hideOnMobile: true,
            render: (rule) => (
              <span className="font-semibold text-heading">{rule.name}</span>
            ),
          },
          {
            key: "window",
            header: "Shift window",
            hideOnMobile: true,
            render: (rule) => (
              <span className="text-neutral whitespace-nowrap">
                {rule.startTime} – {rule.endTime}, {rule.days}
              </span>
            ),
          },
          {
            key: "grace",
            header: "Grace period",
            render: (rule) => (
              <span className="font-medium text-heading whitespace-nowrap">
                {rule.gracePeriodMinutes} min
              </span>
            ),
          },
          {
            key: "break",
            header: "Break",
            render: (rule) => (
              <span className="font-medium text-heading whitespace-nowrap">
                {rule.breakMinutes} min
              </span>
            ),
          },
          {
            key: "overtime",
            header: "Overtime",
            render: (rule) => (
              <span className="font-medium text-heading whitespace-nowrap">
                After {rule.overtimeAfterHours} h
              </span>
            ),
          },
          {
            key: "actions",
            header: "",
            align: "right",
            hideOnMobile: true,
            render: (rule) => (
              <div className="flex items-center justify-end gap-4">
                <button
                  type="button"
                  onClick={() => setModalMode(rule)}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingRule(rule)}
                  className="text-sm font-medium text-alert hover:underline"
                >
                  Delete
                </button>
              </div>
            ),
          },
        ]}
      />

      {deletingRule && (
        <ConfirmDialog
          title={`Delete ${deletingRule.name}?`}
          description="Employees assigned to this rule will have no shift window, grace period or overtime threshold until they are moved to another one."
          note="Removed from this screen only — work rules are not saved to the server yet."
          confirmLabel="Delete rule"
          onConfirm={() => handleDelete(deletingRule)}
          onClose={() => setDeletingRule(null)}
        />
      )}

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
