import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { officeSchema, type OfficeValues } from "@/lib/validation/onboarding";


interface StepOfficeProps {
  defaultValues?: Partial<OfficeValues>;
  onNext: (values: OfficeValues) => void;
  onBack?: () => void;
}

// NOTE: no real map picker yet — deliberately deferred (map library
// choice — Leaflet vs Google Maps vs Mapbox — needs an API key/account
// decision the team hasn't made). Latitude/longitude are plain number
// inputs for now so the form is fully usable and schema-valid; swap
// this block for a real interactive map once that decision is made,
// keeping the same registered field names.
export function StepOffice({ defaultValues, onNext, onBack }: StepOfficeProps) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<OfficeValues>({
    resolver: zodResolver(officeSchema),
    defaultValues: {
      geofenceRadiusMeters: 100,
      ...defaultValues,
    },
  });

  const radius = watch("geofenceRadiusMeters");

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
          <input
            id="address"
            type="text"
            {...register("address")}
            className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {errors.address && (
            <p className="mt-1 text-sm text-alert">{errors.address.message}</p>
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

      {/* Placeholder for the interactive map — see note above the
          component for why this isn't a real map yet. */}
      <div className="rounded-lg border border-neutral/20 bg-neutral/5 p-3">
        <p className="text-xs text-neutral mb-2">
          Map picker coming soon — enter coordinates manually for now.
        </p>
        <div className="grid grid-cols-2 gap-3">
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
