"use client";

import { useRef, useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { appClient, extractErrorMessage } from "@/lib/api-client";
import { useToast } from "@/app/components/Toast";
import { useModalA11y } from "@/lib/useModalA11y";
import type { Department } from "./DepartmentFormModal";

interface DeleteDepartmentModalProps {
  department: Department;
  /** How many employees are currently assigned to it. */
  employeeCount: number;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteDepartmentModal({
  department,
  employeeCount,
  onClose,
  onDeleted,
}: DeleteDepartmentModalProps) {
  const toast = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useModalA11y(panelRef, onClose);

  async function handleConfirm() {
    setError(null);
    setIsDeleting(true);
    try {
      await appClient.delete(`/departments/${department.id}`);
      toast.success(
        department.name + " deleted successfully",
        employeeCount > 0
          ? `${employeeCount} ${
              employeeCount === 1 ? "employee is" : "employees are"
            } now unassigned.`
          : "No employees were assigned to it."
      );
      onDeleted();
      onClose();
    } catch (err) {
      const message = extractErrorMessage(err);
      setError(message);
      toast.error("Could not delete this department", message);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-department-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md bg-surface rounded-xl border border-neutral/20 p-6 outline-none"
      >
        <div className="flex items-start gap-4">
          <div className="shrink-0 h-10 w-10 rounded-full bg-alert/10 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-alert" strokeWidth={2} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h2 id="delete-department-title" className="text-base font-semibold text-heading">
                Delete {department.name}?
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-neutral hover:text-heading shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* The employee relation is optional (User.departmentId is
                nullable), so Prisma's default SetNull applies: this delete
                does NOT fail when people are assigned — it quietly empties
                their department. Stating the count up front is the only
                warning anyone gets. */}
            {employeeCount > 0 ? (
              <p className="text-sm text-neutral mt-2">
                <span className="font-medium text-heading">
                  {employeeCount}{" "}
                  {employeeCount === 1 ? "employee" : "employees"}
                </span>{" "}
                will be left with no department. Their accounts and attendance
                are untouched, but they drop out of department reports until
                they are reassigned.
              </p>
            ) : (
              <p className="text-sm text-neutral mt-2">
                No employees are assigned to this department, so nothing else
                changes.
              </p>
            )}

            {/* Reassigning needs PATCH /users/:id, which does not exist yet
                — so for now this is genuinely hard to undo, and worth
                saying rather than discovering afterwards. */}
            {employeeCount > 0 && (
              <p className="text-xs text-neutral mt-3 border-t border-neutral/20 pt-3">
                There is no way to reassign them from the dashboard yet, so
                consider renaming this department instead of deleting it.
              </p>
            )}

            {error && <p className="mt-3 text-sm text-alert">{error}</p>}

            <div className="flex items-center justify-end gap-3 mt-5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-neutral/30 px-4 py-2 text-sm font-medium text-heading hover:bg-neutral/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isDeleting}
                className="rounded-md bg-alert text-white px-4 py-2 text-sm font-medium hover:bg-alert/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? "Deleting..." : "Delete department"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
