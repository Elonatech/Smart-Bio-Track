"use client";

import { useState } from "react";
import { X, RotateCcw } from "lucide-react";
import { appClient, extractErrorMessage } from "@/lib/api-client";
import { useToast } from "@/app/components/Toast";

interface ReinstateEmployeeModalProps {
  employee: {
    id: string;
    employeeId: string;
    name: string;
    email: string;
  };
  onClose: () => void;
  /** Refetches the list, so the row moves out of "removed". */
  onReinstated: () => void;
}

/**
 * Brings a removed employee back (#23).
 *
 * Deliberately its own modal rather than an action inside
 * `EmployeeDetailModal`. That modal's three actions — suspend, resend, reset —
 * all assume a live account, and its `employee.status` is typed
 * `VisibleUserStatus`, which cannot hold DELETED. Adding reinstatement there
 * would mean widening that type and teaching every one of those actions to
 * stay hidden, to gain nothing: a removed person has one thing that can be
 * done to them.
 *
 * The copy carries more weight than usual because reinstatement is not what
 * most people assume it is. It does **not** restore the old account. The
 * person starts again from an invitation, which is what the 24 Sep 2026
 * decision asked for, and an admin who expects otherwise will report the
 * emailed link as a bug.
 */
export function ReinstateEmployeeModal({
  employee,
  onClose,
  onReinstated,
}: ReinstateEmployeeModalProps) {
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    setIsSubmitting(true);
    try {
      await appClient.post(`/users/${employee.id}/reinstate`, {});
      toast.success(
        employee.name + " reinstated successfully",
        `An invitation is on its way to ${employee.email}. They set a new password from the link inside it.`
      );
      onReinstated();
      onClose();
    } catch (err) {
      const message = extractErrorMessage(err);
      setError(message);
      toast.error("Could not reinstate this person", message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md bg-surface rounded-xl border border-neutral/20 p-6">
        <div className="flex items-start gap-4">
          <div className="shrink-0 h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
            <RotateCcw className="h-5 w-5 text-success" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold text-heading">
                Reinstate {employee.name}?
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
              {employee.email} · {employee.employeeId}
            </p>

            {/* The part an admin is most likely to get wrong. "Reinstate"
                sounds like undo; it is closer to re-hire. */}
            <p className="text-sm text-heading mt-3">
              They will be sent a <span className="font-medium">new invitation</span> and
              set a new password. Their previous password will no longer work.
            </p>

            <p className="text-sm text-neutral mt-3">
              Their attendance and payroll history is still attached to this
              record, so reinstating them keeps it rather than starting a second
              record for the same person.
            </p>

            <p className="text-xs text-neutral mt-3 border-t border-neutral/20 pt-3">
              They stay listed as pending until they accept. Only an
              organization super admin can do this.
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
                disabled={isSubmitting}
                className="rounded-md bg-success text-white px-4 py-2 text-sm font-medium hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Reinstating..." : "Reinstate"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
