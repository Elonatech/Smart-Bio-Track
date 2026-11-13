"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchWorkRules, type WorkRule } from "@/lib/workRules";
import Link from "next/link";
import { MapPin, Plus } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth-store";
import { useOffices, useRefreshOffices } from "@/lib/officeQueries";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import {
  OfficeFormModal,
  type Office,
} from "@/app/components/dashboard/OfficeFormModal";
import { DeleteOfficeModal } from "@/app/components/dashboard/DeleteOfficeModal";

function formatCoord(
  value: number,
  positiveLabel: string,
  negativeLabel: string
) {
  const label = value >= 0 ? positiveLabel : negativeLabel;
  return `${Math.abs(value).toFixed(4)}° ${label}`;
}

// Which hours a branch follows. No rule of its own (null) means the
// organisation's default — the server's rule, so say which one that is.
function ruleLabel(workRuleId: string | null | undefined, rules: WorkRule[]) {
  const own = workRuleId ? rules.find((rule) => rule.id === workRuleId) : undefined;
  if (own) return own.name;
  const fallback = rules.find((rule) => rule.isDefault);
  return fallback ? `${fallback.name} (default)` : "No work rule yet";
}

export default function SuperAdminOfficesPage() {
  const orgName =
    useAuthStore((state) => state.user?.organizationName) ??
    "Your organization";
  // Cached (lib/officeQueries.ts): a return visit shows the list at once
  // and quietly re-checks the server behind it.
  const officesQuery = useOffices();
  const refreshOffices = useRefreshOffices();
  const offices = officesQuery.data ?? [];
  const isLoading = officesQuery.isPending;
  const error = officesQuery.isError
    ? "Couldn't load branches. Please try again."
    : null;
  // Only for naming each branch's hours on its card.
  const workRulesQuery = useQuery({
    queryKey: ["workRules"],
    queryFn: fetchWorkRules,
  });

  // Which modal is open, if any: "create", or the specific office
  // being edited. null = no modal. Shared between Add/Edit buttons so
  // there's only ever one OfficeFormModal instance on screen.
  const [modalMode, setModalMode] = useState<"create" | Office | null>(null);
  const [deletingOffice, setDeletingOffice] = useState<Office | null>(null);

  usePageHeader(
    "Branches & geo-fences",
    `${orgName} · ${offices.length} ${offices.length === 1 ? "location" : "locations"}`
  );

  return (
    <div>
      <div className="flex justify-end mb-6">
        <button
          type="button"
          onClick={() => setModalMode("create")}
          className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2.5 rounded-md hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Add branch
        </button>
      </div>

      {isLoading && <p className="text-sm text-neutral">Loading branches...</p>}

      {error && (
        <div className="mb-4 rounded-md bg-alert/10 border border-alert/30 text-alert text-sm px-3 py-2">
          {error}
        </div>
      )}

      {!isLoading && offices.length === 0 && (
        <div className="text-sm text-neutral">
          <p>
            No branches yet — click &quot;Add branch&quot; to create your first
            one.
          </p>
          {/* A permanent route back into the setup wizard, independent of
              the dashboard banner. The banner can be dismissed for a
              session; this link can't disappear, so there's always a way
              back to the guided flow. */}
          <p className="mt-1">
            Prefer the guided version?{" "}
            <Link href="/onboarding" className="text-primary font-medium">
              Run the setup wizard
            </Link>
            .
          </p>
        </div>
      )}

      {!isLoading && offices.length > 0 && (
        <div className="grid grid-cols-1  xl:grid-cols-3 gap-6">
          {offices.map((office) => (
            <div
              key={office.id}
              className="bg-surface border border-neutral/20 rounded-xl overflow-hidden"
            >
              {/* Placeholder for a real map — no map library chosen
                  yet (same open decision as the onboarding wizard's
                  office step). Faked here with a grid-pattern
                  background, a geo-fence radius circle, and a
                  centered pin, purely visual. */}
              <div
                className="relative h-40 bg-neutral/5"
                style={{
                  backgroundImage:
                    "linear-gradient(color-mix(in srgb, var(--color-neutral) 15%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--color-neutral) 15%, transparent) 1px, transparent 1px)",
                  backgroundSize: "20px 20px",
                }}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-24 w-24 rounded-full border-2 border-primary/40 bg-primary/5 flex items-center justify-center">
                    <span className="h-8 w-8 rounded-full bg-success flex items-center justify-center">
                      <MapPin className="h-4 w-4 text-white" strokeWidth={2} />
                    </span>
                  </div>
                </div>

                <div className="absolute bottom-2 left-2 right-2 bg-surface/95 rounded-md px-3 py-2 shadow-sm">
                  <p className="text-sm font-medium text-heading truncate">
                    {office.name}
                  </p>
                  <p className="text-xs text-neutral">
                    Geo-fence radius {office.geofenceRadiusMeters} m
                  </p>
                </div>
              </div>

              <div className="flex justify-between items-center gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-heading wrap-break-word">
                    {office.name}
                  </p>
                  <p className="text-xs text-neutral">
                    {formatCoord(office.latitude, "N", "S")},{" "}
                    {formatCoord(office.longitude, "E", "W")} · radius{" "}
                    {office.geofenceRadiusMeters} m
                  </p>
                  {/* Left out, not guessed, if the rules couldn't load. */}
                  {workRulesQuery.data && (
                    <p className="text-xs text-neutral mt-1 mb-3">
                      Hours:{" "}
                      <span className="font-medium text-heading">
                        {ruleLabel(office.workRuleId, workRulesQuery.data)}
                      </span>
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <button
                    type="button"
                    onClick={() => setModalMode(office)}
                    className="cursor-pointer text-sm font-medium text-primary hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingOffice(office)}
                    className="cursor-pointer text-sm font-medium text-alert hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalMode && (
        <OfficeFormModal
          office={modalMode === "create" ? undefined : modalMode}
          onClose={() => setModalMode(null)}
          onSaved={refreshOffices}
        />
      )}

      {deletingOffice && (
        <DeleteOfficeModal
          office={deletingOffice}
          onClose={() => setDeletingOffice(null)}
          onDeleted={refreshOffices}
        />
      )}
    </div>
  );
}
