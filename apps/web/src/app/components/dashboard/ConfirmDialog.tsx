"use client";

import { AlertTriangle, X } from "lucide-react";

// A generic confirm step for destructive actions that don't need their
// own modal.
//
// DeleteOfficeModal and DeleteEmployeeModal stay separate because they
// each own an API call, its loading state and its error handling. This
// one is for deletes that are purely local — work rules, holidays —
// where the only thing needed is "are you sure?".
//
// Destructive actions get a confirm step even when the data is local:
// the muscle memory a user builds here carries over to the version that
// does hit a server.
interface ConfirmDialogProps {
  title: string;
  description: string;
  /** Extra line for anything the user should know before confirming. */
  note?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  title,
  description,
  note,
  confirmLabel,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md bg-surface rounded-xl border border-neutral/20 p-6"
      >
        <div className="flex items-start gap-4">
          <div className="shrink-0 h-10 w-10 rounded-full bg-alert/10 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-alert" strokeWidth={2} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold text-heading">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-neutral hover:text-heading shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-neutral mt-2">{description}</p>

            {note && (
              <p className="text-xs text-neutral mt-3 border-t border-neutral/20 pt-3">
                {note}
              </p>
            )}

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
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className="rounded-md bg-alert text-white px-4 py-2 text-sm font-medium hover:bg-alert/90"
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
