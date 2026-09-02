"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { appClient, extractErrorMessage } from "@/lib/api-client";
import { useToast } from "@/app/components/Toast";
import { ROLE_LABEL } from "@/lib/roleCreationMatrix";
import type { UserRole } from "@/lib/store/auth-store";

// Editing an existing person: department, office, role, name.
//
// The immediate need is assignment. The setup wizard's invite step only
// collects name/email/role, so anyone added during setup has no
// department and no office, and until now there was no way to give them
// one — users.controller.ts exposes only POST and GET.
//
// Flip this to true the moment PATCH /users/:id exists. The request
// below is already written against it; nothing else needs changing.
const EDIT_ENDPOINT_READY = false;
const NO_ENDPOINT_HINT =
  "No endpoint updates a user yet — PATCH /users/:id doesn't exist.";

// Email is deliberately not editable: it's the login identifier, and
// changing it is an account-recovery concern rather than a profile edit.
// Status isn't here either — suspending has its own flow.
const editEmployeeSchema = z.object({
  name: z.string().min(2, { message: "Name is required" }),
  role: z.string().min(1, { message: "Role is required" }),
  departmentId: z.string().optional(),
  officeId: z.string().optional(),
});

type EditEmployeeFormValues = z.infer<typeof editEmployeeSchema>;

interface NamedOption {
  id: string;
  name: string;
}

export interface EditableEmployee {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  role: UserRole;
  departmentId: string | null;
  officeId: string | null;
}

interface EditEmployeeModalProps {
  employee: EditableEmployee;
  // ROLE_CREATION_MATRIX entry for the signed-in user — the same limit
  // that applies to creating someone applies to promoting them, so an HR
  // Admin can't turn an employee into a Super Admin.
  allowedRoles: UserRole[];
  onClose: () => void;
  onSaved: () => void;
}

export function EditEmployeeModal({
  employee,
  allowedRoles,
  onClose,
  onSaved,
}: EditEmployeeModalProps) {
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [departments, setDepartments] = useState<NamedOption[]>([]);
  const [offices, setOffices] = useState<NamedOption[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditEmployeeFormValues>({
    resolver: zodResolver(editEmployeeSchema),
    // Pre-filled with what the person currently has, so the form shows
    // their real state rather than blanks to re-enter.
    defaultValues: {
      name: employee.name,
      role: employee.role,
      departmentId: employee.departmentId ?? "",
      officeId: employee.officeId ?? "",
    },
  });

  useEffect(() => {
    Promise.all([
      appClient
        .get<NamedOption[]>("/departments")
        .catch(() => ({ data: [] as NamedOption[] })),
      appClient
        .get<NamedOption[]>("/offices")
        .catch(() => ({ data: [] as NamedOption[] })),
    ]).then(([departmentsRes, officesRes]) => {
      setDepartments(departmentsRes.data);
      setOffices(officesRes.data);
    });
  }, []);

  const onSubmit = async (values: EditEmployeeFormValues) => {
    setServerError(null);
    setIsSubmitting(true);
    try {
      // Empty string means "none" in a <select>; the API expects the
      // field absent rather than blank.
      await appClient.patch(`/users/${employee.id}`, {
        name: values.name,
        role: values.role,
        departmentId: values.departmentId || undefined,
        officeId: values.officeId || undefined,
      });
      toast.success(employee.name + " updated successfully");
      onSaved();
      onClose();
    } catch (error) {
      const message = extractErrorMessage(error);
      setServerError(message);
      toast.error("Could not save changes", message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // The signed-in user's creatable roles, plus whatever this person
  // already is — otherwise editing an HR Admin as another HR Admin would
  // silently offer to demote them, since HR_ADMIN isn't in HR's own
  // creatable list.
  const roleOptions = Array.from(
    new Set<UserRole>([employee.role, ...allowedRoles])
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface rounded-xl border border-neutral/20 p-6">
        <div className="flex items-start justify-between gap-4 mb-1">
          <h2 className="text-lg font-semibold text-heading">Edit employee</h2>
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
          {employee.email} · {employee.employeeId}
        </p>

        {serverError && (
          <div className="mb-4 rounded-md bg-alert/10 border border-alert/30 text-alert text-sm px-3 py-2">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label
              htmlFor="edit-name"
              className="block text-sm font-medium text-heading mb-1"
            >
              Full name
            </label>
            <input
              id="edit-name"
              type="text"
              {...register("name")}
              className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-alert">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="edit-role"
              className="block text-sm font-medium text-heading mb-1"
            >
              Role
            </label>
            <select
              id="edit-role"
              {...register("role")}
              className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-neutral">
              Changes their permissions and which dashboard they sign in to.
            </p>
          </div>

          {/* The reason this modal exists. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="edit-departmentId"
                className="block text-sm font-medium text-heading mb-1"
              >
                Department
              </label>
              <select
                id="edit-departmentId"
                {...register("departmentId")}
                className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">No department</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="edit-officeId"
                className="block text-sm font-medium text-heading mb-1"
              >
                Office
              </label>
              <select
                id="edit-officeId"
                {...register("officeId")}
                className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">No office</option>
                {offices.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-neutral">
                Sets the geo-fence they clock in against.
              </p>
            </div>
          </div>

          {!EDIT_ENDPOINT_READY && (
            <p className="text-xs text-neutral border-t border-neutral/20 pt-3">
              Saving is disabled until the backend exposes an endpoint to
              update a user. The form is otherwise complete.
            </p>
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
              disabled={!EDIT_ENDPOINT_READY || isSubmitting}
              title={EDIT_ENDPOINT_READY ? undefined : NO_ENDPOINT_HINT}
              className="rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
