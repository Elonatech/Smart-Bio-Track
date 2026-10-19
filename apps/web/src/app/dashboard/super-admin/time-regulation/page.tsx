"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth-store";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import { useToast } from "@/app/components/Toast";
import { DataTable } from "@/app/components/dashboard/DataTable";
import { ConfirmDialog } from "@/app/components/dashboard/ConfirmDialog";
import { WorkRuleFormModal } from "@/app/components/dashboard/WorkRuleFormModal";
import { extractErrorMessage } from "@/lib/api-client";
import {
  createWorkRule,
  deleteWorkRule,
  fetchWorkRules,
  formatHours,
  formatWorkingDays,
  updateWorkRule,
  type WorkRule,
  type WorkRuleInput,
} from "@/lib/workRules";

// Work rules on real data (GET/POST/PATCH/DELETE /work-rules, Phase 3 M2).
//
// One rule is the organisation's default; branches can be given their own.
// Changes apply from the next punch — the server snapshots each day's rule,
// so editing hours here never rewrites who was late in past weeks.

const DEFAULT_LOCKED = "This is the default rule. Make another rule the default before deleting it.";

function overtimeLabel(rule: WorkRule): string {
  if (rule.overtimeAfterMinutes === null) return "Not tracked";
  return `After ${formatHours(rule.overtimeAfterMinutes)} · ×${rule.overtimeMultiplier}`;
}

function appliesTo(rule: WorkRule): string {
  const branches = rule.offices.map((o) => o.name).join(", ");
  if (rule.isDefault) {
    return branches ? `Everyone else, plus ${branches}` : "Everyone (default)";
  }
  return branches || "No branches yet";
}

export default function SuperAdminTimeRegulationPage() {
  const toast = useToast();
  const orgName =
    useAuthStore((state) => state.user?.organizationName) ?? "Your organization";
  const [rules, setRules] = useState<WorkRule[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"create" | WorkRule | null>(null);
  const [deletingRule, setDeletingRule] = useState<WorkRule | null>(null);

  usePageHeader(
    "Time Regulation",
    `${orgName} · ${rules ? `${rules.length} rule${rules.length === 1 ? "" : "s"}` : "working hours"}`
  );

  const load = useCallback(() => {
    fetchWorkRules()
      .then((data) => {
        // Default first, then by name — the default is the one people look for.
        setRules([...data].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name)));
        setLoadError(null);
      })
      .catch((error) => setLoadError(extractErrorMessage(error)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(input: WorkRuleInput) {
    const editing = modalMode && modalMode !== "create" ? modalMode : null;
    // Throws on refusal — the modal catches it and shows the reason.
    if (editing) await updateWorkRule(editing.id, input);
    else await createWorkRule(input);
    toast.success(input.name + (editing ? " updated" : " created"), "Applies from the next clock-in.");
    load();
  }

  async function handleMakeDefault(rule: WorkRule) {
    try {
      await updateWorkRule(rule.id, { isDefault: true });
      toast.success(`${rule.name} is now the default`, "Used for everyone whose branch has no rule of its own.");
    } catch (error) {
      toast.error("Couldn't change the default", extractErrorMessage(error));
    } finally {
      load();
    }
  }

  async function handleDelete(rule: WorkRule) {
    try {
      await deleteWorkRule(rule.id);
      toast.success(`${rule.name} deleted`, "Branches that used it now follow the default rule.");
    } catch (error) {
      toast.error("Couldn't delete this rule", extractErrorMessage(error));
    } finally {
      load();
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
          New time regulation
        </button>
      </div>

      {loadError && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-alert/30 bg-alert/10 px-4 py-3">
          <p className="min-w-0 text-sm text-alert wrap-break-word">
            Couldn&apos;t load work rules: {loadError}
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

      {rules === null && !loadError ? (
        <p className="text-sm text-neutral">Loading work rules…</p>
      ) : (
        <DataTable
          rows={rules ?? []}
          getRowKey={(rule) => rule.id}
          pageSize={10}
          itemLabel="rules"
          emptyMessage="No time regulations yet. Create one to start judging lateness and overtime — until then, nobody is marked late."
          renderCardHeader={(rule) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-heading wrap-break-word">
                  {rule.name}
                  {rule.isDefault && <DefaultBadge />}
                </p>
                <p className="text-[12px] text-neutral">
                  {rule.startTime} – {rule.endTime}, {formatWorkingDays(rule.workingDays)}
                </p>
              </div>
              {/* The table's actions column is hideOnMobile, so actions
                  live here too or phones could never delete a rule. */}
              <div className="shrink-0">
                <Actions rule={rule} onMakeDefault={handleMakeDefault} onEdit={setModalMode} onDelete={setDeletingRule} />
              </div>
            </div>
          )}
          columns={[
            {
              key: "name",
              header: "Rule",
              hideOnMobile: true,
              render: (rule) => (
                <span className="font-semibold text-heading">
                  {rule.name}
                  {rule.isDefault && <DefaultBadge />}
                </span>
              ),
            },
            {
              key: "window",
              header: "Shift window",
              hideOnMobile: true,
              render: (rule) => (
                <span className="text-neutral whitespace-nowrap">
                  {rule.startTime} – {rule.endTime}, {formatWorkingDays(rule.workingDays)}
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
              key: "overtime",
              header: "Overtime",
              render: (rule) => (
                <span className="font-medium text-heading whitespace-nowrap">{overtimeLabel(rule)}</span>
              ),
            },
            {
              key: "appliesTo",
              header: "Applies to",
              render: (rule) => <span className="text-neutral">{appliesTo(rule)}</span>,
            },
            {
              key: "actions",
              header: "",
              align: "right",
              hideOnMobile: true,
              render: (rule) => <Actions rule={rule} onMakeDefault={handleMakeDefault} onEdit={setModalMode} onDelete={setDeletingRule} />,
            },
          ]}
        />
      )}

      {deletingRule && (
        <ConfirmDialog
          title={`Delete ${deletingRule.name}?`}
          description={
            deletingRule.offices.length > 0
              ? `${deletingRule.offices.map((o) => o.name).join(", ")} will follow the default rule instead. Past days keep the hours they were judged against.`
              : "Past days keep the hours they were judged against."
          }
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

// Top-level, not defined inside the page: a component declared in a render
// function is a new type every render, so React remounts it — and a click
// can land on a button mid-replacement and do nothing.
function Actions({
  rule,
  onMakeDefault,
  onEdit,
  onDelete,
}: {
  rule: WorkRule;
  onMakeDefault: (rule: WorkRule) => void;
  onEdit: (rule: WorkRule) => void;
  onDelete: (rule: WorkRule) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
      {!rule.isDefault && (
        <button
          type="button"
          onClick={() => onMakeDefault(rule)}
          className="text-sm font-medium text-neutral hover:text-heading hover:underline"
        >
          Make default
        </button>
      )}
      <button
        type="button"
        onClick={() => onEdit(rule)}
        className="text-sm font-medium text-primary hover:underline"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => onDelete(rule)}
        // The server refuses to delete the default; say so before asking.
        disabled={rule.isDefault}
        title={rule.isDefault ? DEFAULT_LOCKED : undefined}
        className="text-sm font-medium text-alert hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
      >
        Delete
      </button>
    </div>
  );
}

function DefaultBadge() {
  return (
    <span className="ml-2 inline-block align-middle rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
      Default
    </span>
  );
}
