"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { appClient, extractErrorMessage } from "@/lib/api-client";
import { useToast } from "@/app/components/Toast";

export interface Department {
  id: string;
  name: string;
}

// Mirrors CreateDepartmentDto: a trimmed string, min length 2. Trimming
// here as well as server-side stops "  HR  " and "HR" looking like two
// different names in the form while the unique constraint treats them as
// one and rejects the save.
const departmentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: "Department name is required" }),
});

type DepartmentFormValues = z.infer<typeof departmentSchema>;

interface DepartmentFormModalProps {
  /** Present = editing that department; absent = creating one. */
  department?: Department;
  onClose: () => void;
  onSaved: () => void;
}

export function DepartmentFormModal({
  department,
  onClose,
  onSaved,
}: DepartmentFormModalProps) {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DepartmentFormValues>({
    resolver: zodResolver(departmentSchema),
    defaultValues: { name: department?.name ?? "" },
  });

  const onSubmit = async (values: DepartmentFormValues) => {
    setError(null);
    try {
      if (department) {
        await appClient.put(`/departments/${department.id}`, values);
        toast.success(
          values.name + " updated successfully",
          "Everyone already in this department keeps their assignment."
        );
      } else {
        await appClient.post("/departments", values);
        toast.success(
          values.name + " created successfully",
          "You can now assign employees to it."
        );
      }
      onSaved();
      onClose();
    } catch (err) {
      // The backend enforces a unique name per organization and answers
      // with a 409 naming the clash, which is more useful than anything
      // generic we could write here.
      const message = extractErrorMessage(err);
      setError(message);
      toast.error(
        department
          ? "Could not update this department"
          : "Could not create this department",
        message
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md bg-surface rounded-xl border border-neutral/20 p-6">
        <div className="flex items-start justify-between gap-4 mb-1">
          <h2 className="text-lg font-semibold text-heading">
            {department ? "Edit department" : "Add department"}
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

        <p className="text-sm text-neutral mb-5">
          Departments group employees for reporting, and are what a Team Lead
          sees on their dashboard.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-heading mb-1"
            >
              Department name
            </label>
            <input
              id="name"
              type="text"
              placeholder="Engineering"
              autoFocus
              {...register("name")}
              className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-alert">{errors.name.message}</p>
            )}
          </div>

          {error && (
            <div className="rounded-md bg-alert/10 border border-alert/30 text-alert text-sm px-3 py-2">
              {error}
            </div>
          )}

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
              className="rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting
                ? "Saving..."
                : department
                  ? "Save changes"
                  : "Create department"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
