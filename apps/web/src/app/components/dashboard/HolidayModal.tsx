"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Toggle } from "@/app/components/dashboard/Toggle";
import { useModalA11y } from "@/lib/useModalA11y";
import { extractErrorMessage } from "@/lib/api-client";
import type { Holiday, HolidayInput } from "@/lib/holidays";

// Saves through the page's onSave (POST/PATCH /holidays). Limits match
// CreateHolidayDto; anything the server still refuses — the same name on the
// same date, say — is shown here and the form stays open.
const holidayFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: "Holiday name is required" })
    .max(80, { message: "Keep the name under 80 characters" }),
  date: z.string().min(1, { message: "Date is required" }),
  repeatsAnnually: z.boolean(),
  type: z.enum(["PUBLIC", "COMPANY"]),
});

type HolidayFormValues = z.infer<typeof holidayFormSchema>;

interface HolidayModalProps {
  /** Present = editing that holiday; absent = adding a new one. Same
      shape as OfficeFormModal, so both modals behave alike. */
  holiday?: Holiday;
  onClose: () => void;
  /** Saves to the server. Throws on refusal; the modal shows the reason. */
  onSave: (values: HolidayInput) => Promise<void>;
}

export function HolidayModal({ holiday, onClose, onSave }: HolidayModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  useModalA11y(panelRef, onClose);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<HolidayFormValues>({
    resolver: zodResolver(holidayFormSchema),
    // Pre-filled when editing so the form shows what the holiday
    // currently is, rather than blanks to retype.
    defaultValues: {
      name: holiday?.name ?? "",
      date: holiday?.date ?? "",
      repeatsAnnually: holiday?.repeatsAnnually ?? false,
      type: holiday?.type ?? "COMPANY",
    },
  });

  // The Toggle is a controlled component, so it can't use register() —
  // it needs the current value read back and written explicitly.
  const repeatsAnnually = watch("repeatsAnnually");

  const onSubmit = async (values: HolidayFormValues) => {
    setServerError(null);
    try {
      await onSave(values);
      onClose();
    } catch (error) {
      setServerError(extractErrorMessage(error));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="holiday-modal-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg max-h-[90dvh] overflow-y-auto bg-surface rounded-xl border border-neutral/20 p-6 outline-none"
      >
        <div className="flex items-start justify-between gap-4 mb-1">
          <h2 id="holiday-modal-title" className="text-lg font-semibold text-heading">
            {holiday ? "Edit holiday" : "Add holiday"}
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

        {/* States the consequence of saving up front — this isn't just a
            label on a calendar, it suspends attendance expectations for
            everyone in the organization. */}
        <p className="text-sm text-neutral mb-5">
          Attendance expectations are suspended for every employee on this date.
        </p>

        {serverError && (
          <div className="mb-4 rounded-md bg-alert/10 border border-alert/30 text-alert text-sm px-3 py-2 wrap-break-word">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Name and date share a row: both are short, and pairing them
              keeps the whole form above the fold. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-heading mb-1"
              >
                Holiday name
              </label>
              <input
                id="name"
                type="text"
                placeholder="Independence Day"
                {...register("name")}
                className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-alert">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="date"
                className="block text-sm font-medium text-heading mb-1"
              >
                Date
              </label>
              <input
                id="date"
                type="date"
                {...register("date")}
                className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {errors.date && (
                <p className="mt-1 text-sm text-alert">{errors.date.message}</p>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="type"
              className="block text-sm font-medium text-heading mb-1"
            >
              Type
            </label>
            <select
              id="type"
              {...register("type")}
              className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="COMPANY">Company — your organization only</option>
              <option value="PUBLIC">Public — national holiday</option>
            </select>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border border-neutral/30 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-heading">
                Repeats every year
              </p>
              <p className="text-[12px] text-neutral">
                Fixed-date public holidays repeat automatically; moveable feasts
                should stay off.
              </p>
            </div>
            <div className="shrink-0 pt-0.5">
              <Toggle
                checked={repeatsAnnually}
                onChange={(checked) =>
                  setValue("repeatsAnnually", checked, { shouldDirty: true })
                }
                label="Repeats every year"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-neutral/30 px-4 py-2 text-sm font-medium text-heading hover:bg-neutral/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
            >
              {isSubmitting ? "Saving..." : holiday ? "Save changes" : "Save holiday"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
