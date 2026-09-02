"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { appClient, extractErrorMessage } from "@/lib/api-client";
import { useToast } from "@/app/components/Toast";

const officeFormSchema = z.object({
  name: z.string().min(3, { message: "Name must be at least 3 characters" }),
  latitude: z.number(),
  longitude: z.number(),
  geofenceRadiusMeters: z.number().min(1).max(100000),
});

type OfficeFormValues = z.infer<typeof officeFormSchema>;

export interface Office {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
}

interface OfficeFormModalProps {
  office?: Office; // present = editing; absent = creating
  onClose: () => void;
  onSaved: () => void; // parent refetches the list after this fires
}

export function OfficeFormModal({ office, onClose, onSaved }: OfficeFormModalProps) {
  const toast = useToast();
  const isEditing = Boolean(office);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<OfficeFormValues>({
    resolver: zodResolver(officeFormSchema),
    defaultValues: {
      name: office?.name ?? "",
      latitude: office?.latitude ?? 6.5244,
      longitude: office?.longitude ?? 3.3792,
      geofenceRadiusMeters: office?.geofenceRadiusMeters ?? 100,
    },
  });

  const radius = watch("geofenceRadiusMeters");
  const name = watch("name");

  const onSubmit = async (values: OfficeFormValues) => {
    setServerError(null);
    setIsSubmitting(true);
    try {
      if (isEditing) {
        await appClient.put(`/offices/${office!.id}`, values);
      } else {
        await appClient.post("/offices", values);
      }
      // Names the office rather than saying "Office created" — after
      // adding several in a row, which one succeeded matters.
      toast.success(
        office
          ? `${values.name} updated successfully`
          : `${values.name} created successfully`,
        `Geo-fence radius ${values.geofenceRadiusMeters} m`
      );
      onSaved();
      onClose();
    } catch (error) {
      const message = extractErrorMessage(error);
      setServerError(message);
      toast.error(
        office ? "Could not update this office" : "Could not create this office",
        message
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-lg bg-surface rounded-xl border border-neutral/20 p-6">
        <div className="flex items-start justify-between mb-1">
          <h2 className="cursor-pointer text-lg font-semibold text-heading">
            {isEditing ? "Edit office" : "Add office"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-neutral hover:text-heading cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm text-neutral mb-4">
          Set the office name and geo-fence radius. Coordinates default to
          Lagos — adjust to the real location.
        </p>

        {serverError && (
          <div className="mb-4 rounded-md bg-alert/10 border border-alert/30 text-alert text-sm px-3 py-2">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-heading mb-1">
              Office name
            </label>
            <input
              id="name"
              type="text"
              {...register("name")}
              className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-alert">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="latitude" className="block text-sm font-medium text-heading mb-1">
                Latitude
              </label>
              <input
                id="latitude"
                type="number"
                step="any"
                {...register("latitude", { valueAsNumber: true })}
                className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {errors.latitude && (
                <p className="mt-1 text-sm text-alert">{errors.latitude.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="longitude" className="block text-sm font-medium text-heading mb-1">
                Longitude
              </label>
              <input
                id="longitude"
                type="number"
                step="any"
                {...register("longitude", { valueAsNumber: true })}
                className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {errors.longitude && (
                <p className="mt-1 text-sm text-alert">{errors.longitude.message}</p>
              )}
            </div>
          </div>

          {/* Same placeholder-map pattern as the onboarding wizard's
              office step — no real map library chosen yet. */}
          <div className="relative h-32 rounded-lg bg-neutral/5 border border-neutral/20 overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-16 w-16 rounded-full border-2 border-primary/40 bg-primary/5 flex items-center justify-center">
                <span className="h-6 w-6 rounded-full bg-success" />
              </div>
            </div>
            <div className="absolute bottom-2 left-2 right-2 bg-surface/95 rounded-md px-2 py-1.5 shadow-sm">
              <p className="text-xs font-medium text-heading truncate">
                {name || "New office"}
              </p>
              <p className="text-[11px] text-neutral">
                Geo-fence radius {radius} m
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="geofenceRadiusMeters"
              className="block text-sm font-medium text-heading mb-1"
            >
              Geo-fence radius — {radius} m
            </label>
            <input
              id="geofenceRadiusMeters"
              type="range"
              min={10}
              max={1000}
              {...register("geofenceRadiusMeters", { valueAsNumber: true })}
              className="w-full accent-primary"
            />
            {errors.geofenceRadiusMeters && (
              <p className="mt-1 text-sm text-alert">
                {errors.geofenceRadiusMeters.message}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-md border border-neutral/30 px-4 py-2 text-sm font-medium text-heading hover:bg-neutral/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="cursor-pointer rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
            >
              {isSubmitting ? "Saving..." : "Save office"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
