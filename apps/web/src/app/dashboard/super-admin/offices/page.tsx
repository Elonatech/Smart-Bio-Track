"use client";

import { useEffect, useState, useCallback } from "react";
import { MapPin, Plus } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth-store";
import { appClient } from "@/lib/api-client";
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

export default function SuperAdminOfficesPage() {
  const orgName =
    useAuthStore((state) => state.user?.organizationName) ??
    "Your organization";
  const [offices, setOffices] = useState<Office[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Which modal is open, if any: "create", or the specific office
  // being edited. null = no modal. Shared between Add/Edit buttons so
  // there's only ever one OfficeFormModal instance on screen.
  const [modalMode, setModalMode] = useState<"create" | Office | null>(null);
  const [deletingOffice, setDeletingOffice] = useState<Office | null>(null);

  const fetchOffices = useCallback(() => {
    setIsLoading(true);
    appClient
      .get<Office[]>("/offices")
      .then((res) => setOffices(res.data))
      .catch(() => setError("Couldn't load offices. Please try again."))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchOffices();
  }, [fetchOffices]);

  usePageHeader(
    "Our offices & geo-fences",
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
          Add office
        </button>
      </div>

      {isLoading && <p className="text-sm text-neutral">Loading offices...</p>}

      {error && (
        <div className="mb-4 rounded-md bg-alert/10 border border-alert/30 text-alert text-sm px-3 py-2">
          {error}
        </div>
      )}

      {!isLoading && offices.length === 0 && (
        <p className="text-sm text-neutral">
          No offices yet — click &quot;Add office&quot; to create your first
          one.
        </p>
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

              <div className="flex justify-between items-center p-4 ">
                <div className=" ">
                  <p className="text-sm font-semibold text-heading">
                    {office.name}
                  </p>
                  <p className="text-xs text-neutral mb-3">
                    {formatCoord(office.latitude, "N", "S")},{" "}
                    {formatCoord(office.longitude, "E", "W")} · radius{" "}
                    {office.geofenceRadiusMeters} m
                  </p>
                </div>

                <div className="flex items-center gap-4">
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
          onSaved={fetchOffices}
        />
      )}

      {deletingOffice && (
        <DeleteOfficeModal
          office={deletingOffice}
          onClose={() => setDeletingOffice(null)}
          onDeleted={fetchOffices}
        />
      )}
    </div>
  );
}
