"use client";

import { useState } from "react";
import { X, MailCheck } from "lucide-react";
import { appClient, extractErrorMessage } from "@/lib/api-client";
import { useToast } from "@/app/components/Toast";
import type { UserRole } from "@/lib/store/auth-store";
import { ROLE_LABEL } from "@/lib/roleCreationMatrix";

export interface EmployeeDetail {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  role: UserRole;
  status: "PENDING" | "ACTIVE" | "SUSPENDED";
  departmentName: string | null;
  officeName: string | null;
}

interface EmployeeDetailModalProps {
  employee: EmployeeDetail;
  onClose: () => void;
  /** Refetches the employee list after a status change. */
  onStatusChanged: () => void;
}

export function EmployeeDetailModal({
  employee,
  onClose,
  onStatusChanged,
}: EmployeeDetailModalProps) {
  const toast = useToast();
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  // PATCH /users/:id/status is a toggle, not a one-way suspend, so the
  // button has to read the current status to say what it will do.
  const isSuspended = employee.status === "SUSPENDED";

  // The backend rejects this for PENDING users: they have never set a
  // password, so there is no active account to suspend and flipping them
  // to ACTIVE would create a row the list calls active but login refuses.
  // Withdrawing an unaccepted invite is a delete, not a suspend.
  const isPending = employee.status === "PENDING";

  async function handleToggleStatus() {
    setIsTogglingStatus(true);
    try {
      await appClient.patch(`/users/${employee.id}/status`, {});
      toast.success(
        isSuspended
          ? employee.name + " restored successfully"
          : employee.name + " suspended successfully",
        isSuspended
          ? "They can sign in and clock in again."
          : "They are signed out and cannot sign in until restored."
      );
      onStatusChanged();
      onClose();
    } catch (error) {
      const message = extractErrorMessage(error);
      toast.error(
        isSuspended
          ? "Could not restore this person"
          : "Could not suspend this person",
        message
      );
    } finally {
      setIsTogglingStatus(false);
    }
  }
  const [isResetSent, setIsResetSent] = useState(false);

  async function handleConfirmReset() {
    setResetError(null);
    setIsSendingReset(true);
    try {
      // POST /auth/forgot-password emails the link itself and answers with
      // the same generic response either way — deliberately, so the endpoint
      // can't be used to discover which addresses have accounts. That means
      // a 200 here confirms the request was accepted, NOT that an email went
      // out: a PENDING or unknown account produces this identical response.
      // The copy below says so rather than promising delivery.
      await appClient.post("/auth/forgot-password", { email: employee.email });
      setIsResetSent(true);
      toast.success(
        "Password reset requested successfully",
        `If ${employee.email} belongs to an active account, a reset email is on its way.`
      );
    } catch (error) {
      const message = extractErrorMessage(error);
      setResetError(message);
      toast.error("Could not generate a reset link", message);
    } finally {
      setIsSendingReset(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md bg-surface rounded-xl border border-neutral/20 p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold text-heading">{employee.name}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-neutral hover:text-heading"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-xs font-medium tracking-wide uppercase text-neutral">
              Employee ID
            </p>
            <p className="text-sm text-heading mt-0.5">{employee.employeeId}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide uppercase text-neutral">Email</p>
            <p className="text-sm text-heading mt-0.5">{employee.email}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide uppercase text-neutral">
              Department
            </p>
            <p className="text-sm text-heading mt-0.5">{employee.departmentName ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide uppercase text-neutral">Role</p>
            <p className="text-sm text-heading mt-0.5">{ROLE_LABEL[employee.role]}</p>
          </div>
        </div>

        {/* Phone, job role, assigned work rule, attendance stats, and
            registered devices all have no backend support yet — no
            columns/models exist for any of them (confirmed against
            prisma/schema.prisma). Shown honestly as unavailable rather
            than displaying fabricated numbers. */}
        <p className="text-xs text-neutral border-t border-neutral/20 pt-3 mb-4">
          Phone, job role, assigned work rule, attendance stats, and
          registered devices aren&apos;t available yet — no backend support
          exists for them.
        </p>

        {isConfirmingReset ? (
          isResetSent ? (
            <div>
              <div className="flex items-start gap-3 rounded-md border border-success/30 bg-success/10 px-3 py-3">
                <MailCheck
                  className="h-5 w-5 shrink-0 text-success"
                  strokeWidth={1.75}
                />
                <p className="text-sm text-heading">
                  If{" "}
                  <span className="font-medium wrap-break-word">
                    {employee.email}
                  </span>{" "}
                  belongs to an active account, a password reset email has
                  been sent. The link expires shortly.
                </p>
              </div>
              <p className="mt-3 text-xs text-neutral">
                Accounts that were never activated get no reset email — send
                them a fresh invitation instead.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 w-full rounded-md bg-primary text-white py-2 text-sm font-medium hover:bg-primary/90"
              >
                Done
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold text-heading mb-1">
                Reset password for {employee.name}?
              </p>
              <p className="text-sm text-neutral mb-4">
                Their current password stops working immediately and all
                signed-in sessions are ended.
              </p>
              {resetError && (
                <div className="mb-3 rounded-md bg-alert/10 border border-alert/30 text-alert text-sm px-3 py-2">
                  {resetError}
                </div>
              )}
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsConfirmingReset(false)}
                  className="rounded-md border border-neutral/30 px-4 py-2 text-sm font-medium text-heading hover:bg-neutral/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReset}
                  disabled={isSendingReset}
                  className="rounded-md bg-alert text-white px-4 py-2 text-sm font-medium hover:bg-alert/90 disabled:opacity-60"
                >
                  {isSendingReset ? "Sending..." : "Send reset link"}
                </button>
              </div>
            </div>
          )
        ) : (
          <div className="flex items-center gap-3 pt-2 border-t border-neutral/20">
            <button
              type="button"
              onClick={() => setIsConfirmingReset(true)}
              className="flex-1 rounded-md border border-neutral/30 px-4 py-2 text-sm font-medium text-heading hover:bg-neutral/10"
            >
              Reset password
            </button>
            <button
              type="button"
              onClick={handleToggleStatus}
              disabled={isPending || isTogglingStatus}
              title={
                isPending
                  ? "They haven't accepted their invitation yet, so there is no active account to suspend. Remove them instead."
                  : undefined
              }
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed ${
                isSuspended ? "bg-success hover:bg-success/90" : "bg-alert hover:bg-alert/90"
              }`}
            >
              {isTogglingStatus
                ? isSuspended
                  ? "Restoring..."
                  : "Suspending..."
                : isSuspended
                  ? "Restore access"
                  : "Suspend employee"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
