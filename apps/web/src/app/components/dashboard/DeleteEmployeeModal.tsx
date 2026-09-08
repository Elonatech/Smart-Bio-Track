"use client";

import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { appClient, extractErrorMessage } from "@/lib/api-client";
import { useToast } from "@/app/components/Toast";
import type { EditableEmployee } from "./EditEmployeeModal";

interface DeleteEmployeeModalProps {
  employee: EditableEmployee;
  onClose: () => void;
  onDeleted: () => void; 
}

export function DeleteEmployeeModal({
  employee,
  onClose,
  onDeleted,
}: DeleteEmployeeModalProps) {
  const toast = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    setIsDeleting(true);
    try {
      await appClient.delete(`/users/${employee.id}`);
      toast.success(
        employee.name + " removed successfully",
        "Their account and sign-in access have been permanently deleted."
      );
      onDeleted();
      onClose();
    } catch (err) {
      const message = extractErrorMessage(err);
      setError(message);
      toast.error("Could not remove this person", message);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md bg-surface rounded-xl border border-neutral/20 p-6">
        <div className="flex items-start gap-4">
          <div className="shrink-0 h-10 w-10 rounded-full bg-alert/10 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-alert" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold text-heading">
                Remove {employee.name}?
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

            <p className="text-sm text-neutral mt-2">
              They lose access immediately and can no longer sign in or clock
              in. {employee.email} · {employee.employeeId}
            </p>

            {/* DELETE /users/:id is a hard row delete (users.service.ts),
                not a soft archive — the record and its tokens are gone and
                cannot be restored. Saying so plainly matters: an earlier
                draft of this copy claimed their history was retained, which
                would have made this button look far safer than it is. */}
            <p className="text-sm text-alert mt-3">
              This permanently deletes their account. It cannot be undone, and
              re-adding them later creates a new employee ID.
            </p>

            <p className="text-xs text-neutral mt-3 border-t border-neutral/20 pt-3">
              Only removing someone who has actually left? If they may return,
              suspend them from the detail view instead — that keeps the
              account and can be reversed.
            </p>

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
                {isDeleting ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
