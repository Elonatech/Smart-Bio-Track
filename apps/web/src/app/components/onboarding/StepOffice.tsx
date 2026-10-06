import dynamic from "next/dynamic";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { officeSchema, type OfficeValues } from "@/lib/validation/onboarding";
import { geocodeAddressWithFallback } from "@/lib/geocode";

// ssr:false is required, not optional, here: Leaflet reads `window` at
// module-evaluation time (inside GeofenceMapPicker's top-level
// L.Icon.Default.mergeOptions call), and `next build` prerenders this
// page server-side, where `window` does not exist. A static import broke
// the whole build ("/onboarding, exiting the build") the moment this step
// gained a real map — dynamic() with ssr:false defers evaluating the
// module at all until the client, after hydration.
const GeofenceMapPicker = dynamic(
  () =>
    import("@/app/components/dashboard/GeofenceMapPicker").then(
      (mod) => mod.GeofenceMapPicker
    ),
  { ssr: false }
);

// Lagos, matching OfficeFormModal's default — someone setting up their
// first office rarely already knows exact decimal coordinates, so the pin
// has to start somewhere sensible rather than at (0, 0) in the ocean.
const DEFAULT_LATITUDE = 6.5244;
const DEFAULT_LONGITUDE = 3.3792;

interface StepOfficeProps {
  defaultValues?: Partial<OfficeValues>;
  onNext: (values: OfficeValues) => void;
  onBack?: () => void;
}

export function StepOffice({ defaultValues, onNext, onBack }: StepOfficeProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<OfficeValues>({
    resolver: zodResolver(officeSchema),
    defaultValues: {
      geofenceRadiusMeters: 100,
      latitude: DEFAULT_LATITUDE,
      longitude: DEFAULT_LONGITUDE,
      ...defaultValues,
    },
  });

  const radius = watch("geofenceRadiusMeters");
  const latitude = watch("latitude");
  const longitude = watch("longitude");
  const address = watch("address");

  function handleMapPositionChange(lat: number, lng: number) {
    setValue("latitude", lat, { shouldValidate: true, shouldDirty: true });
    setValue("longitude", lng, { shouldValidate: true, shouldDirty: true });
  }

  // Searching an address INSIDE the map, or using the device's real
  // location, already tells this form where the office is — without
  // this, the Address field up here stayed blank until the same address
  // was typed a second time, into a second box, a few inches below.
  function handleAddressResolved(address: string) {
    setValue("address", address, { shouldValidate: true, shouldDirty: true });
  }

  // The reverse of the above: THIS field is the one someone reaches for
  // first — it's labelled "Address" and sits above everything else. Only
  // the map's own internal search box moved the pin, so typing a real
  // address up here visibly did nothing, which reads as broken even
  // though the map-box workaround worked. Same lookup, same fallback
  // behaviour as that box (see lib/geocode.ts) — this field can now
  // trigger it too, via the button below or by pressing Enter.
  const [isLocatingAddress, setIsLocatingAddress] = useState(false);
  const [locateAddressError, setLocateAddressError] = useState<string | null>(null);

  async function handleLocateAddress() {
    const query = (address ?? "").trim();
    if (!query) return;

    setIsLocatingAddress(true);
    setLocateAddressError(null);
    try {
      const result = await geocodeAddressWithFallback(query);
      if (!result) {
        setLocateAddressError(
          "No location found for this address. Use the map's search box, or place the pin manually."
        );
        return;
      }
      handleMapPositionChange(parseFloat(result.lat), parseFloat(result.lon));
    } catch {
      setLocateAddressError("Address lookup failed. Try again.");
    } finally {
      setIsLocatingAddress(false);
    }
  }

  const onSubmit = (values: OfficeValues) => {
    onNext(values);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="officeName"
            className="block text-sm font-medium text-heading mb-1"
          >
            Office name
          </label>
          <input
            id="officeName"
            type="text"
            {...register("officeName")}
            className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {errors.officeName && (
            <p className="mt-1 text-sm text-alert">{errors.officeName.message}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="address"
            className="block text-sm font-medium text-heading mb-1"
          >
            Address
          </label>
          <div className="flex gap-2">
            <input
              id="address"
              type="text"
              {...register("address")}
              onKeyDown={(event) => {
                // Same reasoning as the map's own search box: this input
                // sits inside StepOffice's <form>, so an unhandled Enter
                // would submit the whole step instead of locating the
                // address.
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleLocateAddress();
                }
              }}
              className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="button"
              onClick={handleLocateAddress}
              disabled={isLocatingAddress || !address?.trim()}
              className="shrink-0 rounded-md border border-neutral/30 px-3 py-2 text-sm font-medium text-heading hover:bg-neutral/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLocatingAddress ? "Locating…" : "Locate"}
            </button>
          </div>
          {errors.address && (
            <p className="mt-1 text-sm text-alert">{errors.address.message}</p>
          )}
          {locateAddressError && (
            <p className="mt-1 text-sm text-alert">{locateAddressError}</p>
          )}
        </div>
      </div>

      <div>
        <label
          htmlFor="landmark"
          className="block text-sm font-medium text-heading mb-1"
        >
          Landmark
        </label>
        <input
          id="landmark"
          type="text"
          {...register("landmark")}
          className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <p className="mt-1 text-xs text-neutral">
          Helps field staff and drivers locate the office precisely.
        </p>
      </div>

      <div>
        <p className="block text-sm font-medium text-heading mb-1">Location</p>
        <GeofenceMapPicker
          latitude={latitude ?? DEFAULT_LATITUDE}
          longitude={longitude ?? DEFAULT_LONGITUDE}
          radiusMeters={radius ?? 100}
          onPositionChange={handleMapPositionChange}
          onAddressResolved={handleAddressResolved}
        />
        <p className="mt-1 text-xs text-neutral">
          Drag the pin or click anywhere on the map to set the office
          location.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="latitude"
              className="block text-xs font-medium text-heading mb-1"
            >
              Latitude
            </label>
            <input
              id="latitude"
              type="number"
              step="any"
              min={-90}
              max={90}
              {...register("latitude", { valueAsNumber: true })}
              className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {errors.latitude && (
              <p className="mt-1 text-sm text-alert">{errors.latitude.message}</p>
            )}
          </div>
          <div>
            <label
              htmlFor="longitude"
              className="block text-xs font-medium text-heading mb-1"
            >
              Longitude
            </label>
            <input
              id="longitude"
              type="number"
              step="any"
              min={-180}
              max={180}
              {...register("longitude", { valueAsNumber: true })}
              className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {errors.longitude && (
              <p className="mt-1 text-sm text-alert">{errors.longitude.message}</p>
            )}
          </div>
        </div>
      </div>

      <div>
        <label
          htmlFor="geofenceRadiusMeters"
          className="block text-sm font-medium text-heading mb-1"
        >
          Geo-fence radius — {radius ?? 100} m
        </label>
        <input
          id="geofenceRadiusMeters"
          type="range"
          min={10}
          max={1000}
          {...register("geofenceRadiusMeters", { valueAsNumber: true })}
          className="w-full accent-primary"
        />
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-neutral/20">
        <button
          type="button"
          onClick={onBack}
          disabled={!onBack}
          className="text-sm font-medium text-neutral hover:text-heading disabled:opacity-40 disabled:cursor-not-allowed"
        >
          &larr; Back
        </button>
        <button
          type="submit"
          className="rounded-md bg-primary text-white px-5 py-2 text-sm font-medium hover:bg-primary/90"
        >
          Continue &rarr;
        </button>
      </div>
    </form>
  );
}
