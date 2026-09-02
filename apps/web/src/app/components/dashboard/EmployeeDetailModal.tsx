"use client";

import { useState } from "react";
import { X, Copy, Check } from "lucide-react";
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
}

export function EmployeeDetailModal({ employee, onClose }: EmployeeDetailModalProps) {
  const toast = useToast();
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  async function handleConfirmReset() {
    setResetError(null);
    setIsSendingReset(true);
    try {
      // Real endpoint, really works — POST /auth/forgot-password returns
      // a resetToken directly in the response (same temporary hack as
      // the invite activation token: no email service exists yet, so
      // whoever triggers this has to relay the link manually).
      const { data } = await appClient.post<{ resetToken?: string }>(
        "/auth/forgot-password",
        { email: employee.email }
      );
      if (data.resetToken) {
        setResetLink(`${window.location.origin}/auth/reset-password?token=${data.resetToken}`);
        toast.success(
          "Reset link generated successfully",
          "Copy it and send it to " + employee.name + " — no email is sent yet."
        );
      } else {
        // PENDING/never-activated users get the generic response with
        // no token (see auth.service.ts) — nothing to relay in that case.
        const inactive =
          "No reset link was generated — this account may not be active yet.";
        setResetError(inactive);
        toast.error("Could not generate a reset link", inactive);
      }
    } catch (error) {
      const message = extractErrorMessage(error);
      setResetError(message);
      toast.error("Could not generate a reset link", message);
    } finally {
      setIsSendingReset(false);
    }
  }

  function handleCopy() {
    if (!resetLink) return;
    navigator.clipboard.writeText(resetLink);
    toast.success("Reset link copied", "Send it to " + employee.name + ".");
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
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
          resetLink ? (
            <div>
              <p className="text-sm text-neutral mb-3">
                No email service is set up yet — copy this link and send it
                to {employee.name.split(" ")[0]} directly.
              </p>
              <div className="flex items-center gap-2 rounded-md border border-neutral/40 px-3 py-2 bg-neutral/5">
                <span className="text-xs text-heading truncate flex-1">{resetLink}</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label="Copy link"
                  className="shrink-0 text-primary hover:text-primary/80"
                >
                  {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
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
              disabled
              title="Not available yet — no backend endpoint exists to change a user's status."
              className="flex-1 rounded-md bg-alert/40 text-white px-4 py-2 text-sm font-medium cursor-not-allowed"
            >
              Suspend employee
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
