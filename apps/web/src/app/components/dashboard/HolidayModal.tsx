"use client";

import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Toggle } from "@/app/components/dashboard/Toggle";

const holidayFormSchema = z.object({
  name: z.string().min(2, { message: "Holiday name is required" }),
  date: z.string().min(1, { message: "Date is required" }),
  repeatsAnnually: z.boolean(),
  type: z.enum(["PUBLIC", "COMPANY"]),
});

type HolidayFormValues = z.infer<typeof holidayFormSchema>;

export interface Holiday extends HolidayFormValues {
  id: string;
}

interface HolidayModalProps {
  onClose: () => void;
  onSave: (values: HolidayFormValues) => void;
}

export function HolidayModal({ onClose, onSave }: HolidayModalProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<HolidayFormValues>({
    resolver: zodResolver(holidayFormSchema),
    defaultValues: {
      name: "",
      date: "",
      repeatsAnnually: false,
      // No Type picker on this form by design. The PUBLIC entries are
      // the pre-seeded national calendar; anything an admin adds by hand
      // is a company holiday, so it defaults there rather than asking a
      // question with an obvious answer.
      type: "COMPANY",
    },
  });

  // The Toggle is a controlled component, so it can't use register() —
  // it needs the current value read back and written explicitly.
  const repeatsAnnually = watch("repeatsAnnually");

  const onSubmit = (values: HolidayFormValues) => {
    onSave(values);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-lg bg-surface rounded-xl border border-neutral/20 p-6">
        <div className="flex items-start justify-between gap-4 mb-1">
          <h2 className="text-lg font-semibold text-heading">Add holiday</h2>
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
          Attendance expectations are suspended for every employee on this
          date.
        </p>

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

          <div className="flex items-start justify-between gap-4 rounded-md border border-neutral/30 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-heading">
                Repeats every year
              </p>
              <p className="text-[12px] text-neutral">
                Fixed-date public holidays repeat automatically; moveable
                feasts should stay off.
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
              className="rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary/90"
            >
              Save holiday
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
