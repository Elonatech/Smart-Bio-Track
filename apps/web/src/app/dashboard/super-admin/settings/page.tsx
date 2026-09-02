"use client";

import { useState } from "react";
import { useAuthStore } from "@/lib/store/auth-store";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import { Toggle } from "@/app/components/dashboard/Toggle";
import { useToast } from "@/app/components/Toast";
 

const REQUIRED_SIGNALS = [
  { key: "platformBiometric", label: "Platform biometric verification", defaultOn: true },
  { key: "trustedDevice", label: "Trusted device match", defaultOn: true },
  { key: "geoFence", label: "Geo-fence containment", defaultOn: true },
  { key: "gpsAccuracy", label: "GPS accuracy under 50 m", defaultOn: true },
  { key: "mockLocation", label: "Mock-location detection", defaultOn: false },
  { key: "officeNetwork", label: "Office network validation", defaultOn: false },
] as const;

const SECURITY_POLICIES = [
  { key: "reauth12h", label: "Require re-authentication every 12 hours", defaultOn: true },
  { key: "blockUnregistered", label: "Block sign-in from unregistered devices", defaultOn: true },
  { key: "notifyHrFlags", label: "Notify HR on three consecutive flagged punches", defaultOn: false },
  { key: "enforce2fa", label: "Enforce two-factor authentication for admin s", defaultOn: true },
] as const;

type SignalKey = (typeof REQUIRED_SIGNALS)[number]["key"];
type PolicyKey = (typeof SECURITY_POLICIES)[number]["key"];

export default function SuperAdminSettingsPage() {
  const toast = useToast();
  const orgName = useAuthStore((state) => state.user?.organizationName) ?? "Your organization";
  usePageHeader("Organization settings", "Changes are written to the immutable audit log");

  const [autoApproveAt, setAutoApproveAt] = useState(75);
  const [autoRejectBelow, setAutoRejectBelow] = useState(40);

  const [signals, setSignals] = useState<Record<SignalKey, boolean>>(
    Object.fromEntries(REQUIRED_SIGNALS.map((s) => [s.key, s.defaultOn])) as Record<SignalKey, boolean>
  );

  const [policies, setPolicies] = useState<Record<PolicyKey, boolean>>(
    Object.fromEntries(SECURITY_POLICIES.map((p) => [p.key, p.defaultOn])) as Record<PolicyKey, boolean>
  );

  const [auditRetentionYears, setAuditRetentionYears] = useState(7);
  const [punchRetentionYears, setPunchRetentionYears] = useState(5);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Trust score thresholds */}
      <div className="bg-surface border border-neutral/20 rounded-xl p-5">
        <h2 className="text-base font-semibold text-heading">Trust score thresholds</h2>
        <p className="text-sm text-neutral mt-1 mb-4">
          Punches are auto-approved above the upper threshold and rejected below the lower one.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="autoApprove" className="block text-sm font-medium text-heading mb-1">
              Auto-approve at or above
            </label>
            <input
              id="autoApprove"
              type="number"
              min={0}
              max={100}
              value={autoApproveAt}
              onChange={(e) => setAutoApproveAt(Number(e.target.value))}
              className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="autoReject" className="block text-sm font-medium text-heading mb-1">
              Auto-reject below
            </label>
            <input
              id="autoReject"
              type="number"
              min={0}
              max={100}
              value={autoRejectBelow}
              onChange={(e) => setAutoRejectBelow(Number(e.target.value))}
              className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* This button previously had no onClick at all — it looked
            live and did nothing on click, with no feedback either way.
            There's no settings endpoint (no model for any of this), so
            it confirms what actually happened rather than implying a
            save that didn't occur. */}
        <button
          type="button"
          onClick={() =>
            toast.info(
              "Thresholds applied on this screen",
              "Not saved to the server yet — organization settings have no backend model."
            )
          }
          className="rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary/90"
        >
          Save thresholds
        </button>
      </div>

      {/* Required signals */}
      <div className="bg-surface border border-neutral/20 rounded-xl p-5">
        <h2 className="text-base font-semibold text-heading">Required signals</h2>
        <p className="text-sm text-neutral mt-1 mb-4">
          Signals that must pass before a punch can be auto-approved.
        </p>

        <div className="space-y-4">
          {REQUIRED_SIGNALS.map((signal) => (
            <div key={signal.key} className="flex items-center justify-between">
              <span className="text-sm text-heading">{signal.label}</span>
              <Toggle
                checked={signals[signal.key]}
                onChange={(checked) =>
                  setSignals((prev) => ({ ...prev, [signal.key]: checked }))
                }
                label={signal.label}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Security policy */}
      <div className="bg-surface border border-neutral/20 rounded-xl p-5">
        <h2 className="text-base font-semibold text-heading mb-4">Security policy</h2>

        <div className="space-y-4">
          {SECURITY_POLICIES.map((policy) => (
            <div key={policy.key} className="flex items-center justify-between">
              <span className="text-sm text-heading">{policy.label}</span>
              <Toggle
                checked={policies[policy.key]}
                onChange={(checked) =>
                  setPolicies((prev) => ({ ...prev, [policy.key]: checked }))
                }
                label={policy.label}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Data retention */}
      <div className="bg-surface border border-neutral/20 rounded-xl p-5">
        <h2 className="text-base font-semibold text-heading mb-4">Data retention</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="auditRetention" className="block text-sm font-medium text-heading mb-1">
              Audit log retention (years)
            </label>
            <input
              id="auditRetention"
              type="number"
              min={1}
              max={20}
              value={auditRetentionYears}
              onChange={(e) => setAuditRetentionYears(Number(e.target.value))}
              className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="punchRetention" className="block text-sm font-medium text-heading mb-1">
              Punch record retention (years)
            </label>
            <input
              id="punchRetention"
              type="number"
              min={1}
              max={20}
              value={punchRetentionYears}
              onChange={(e) => setPunchRetentionYears(Number(e.target.value))}
              className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <p className="text-xs text-neutral mt-4">
          These settings apply to {orgName} only. Raw biometric data is never
          transmitted or stored.
        </p>
      </div>
    </div>
  );
}
