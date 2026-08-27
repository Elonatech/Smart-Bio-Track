"use client";

import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const holidayFormSchema = z.object({
  name: z.string().min(2, { message: "Holiday name is required" }),
  date: z.string().min(1, { message: "Date is required" }),
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
    formState: { errors },
  } = useForm<HolidayFormValues>({
    resolver: zodResolver(holidayFormSchema),
    defaultValues: { name: "", date: "", type: "PUBLIC" },
  });

  const onSubmit = (values: HolidayFormValues) => {
    onSave(values);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md bg-surface rounded-xl border border-neutral/20 p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold text-heading">Add holiday</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-neutral hover:text-heading"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-heading mb-1">
              Holiday name
            </label>
            <input
              id="name"
              type="text"
              placeholder="e.g. Company closure"
              {...register("name")}
              className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-alert">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="date" className="block text-sm font-medium text-heading mb-1">
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

          <div>
            <label htmlFor="type" className="block text-sm font-medium text-heading mb-1">
              Type
            </label>
            <select
              id="type"
              {...register("type")}
              className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="PUBLIC">Public</option>
              <option value="COMPANY">Company</option>
            </select>
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
