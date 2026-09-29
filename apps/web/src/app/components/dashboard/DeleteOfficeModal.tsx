"use client";

import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { appClient, extractErrorMessage } from "@/lib/api-client";
import { useToast } from "@/app/components/Toast";
import type { Office } from "./OfficeFormModal";

interface DeleteOfficeModalProps {
  office: Office;
  onClose: () => void;
  onDeleted: () => void; // parent refetches the list after this fires
}

export function DeleteOfficeModal({ office, onClose, onDeleted }: DeleteOfficeModalProps) {
  const toast = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    setIsDeleting(true);
    try {
      await appClient.delete(`/offices/${office.id}`);
      toast.success(office.name + " deleted successfully", "Employees assigned to it will need a new office.");
      onDeleted();
      onClose();
    } catch (err) {
      const message = extractErrorMessage(err);
      setError(message);
      toast.error("Could not delete this office", message);
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
                Delete {office.name}?
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
            <p className="mt-2 text-sm text-neutral">
              Employees assigned to this office will no longer be able to
              clock in until they are moved to another geo-fence. Existing
              attendance records are preserved.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-alert/10 border border-alert/30 text-alert text-sm px-3 py-2">
            {error}
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-neutral/20 flex items-center justify-end gap-3">
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
            className="rounded-md bg-alert text-white px-4 py-2 text-sm font-medium hover:bg-alert/90 disabled:opacity-60"
          >
            {isDeleting ? "Deleting..." : "Delete office"}
          </button>
        </div>
      </div>
    </div>
  );
}
