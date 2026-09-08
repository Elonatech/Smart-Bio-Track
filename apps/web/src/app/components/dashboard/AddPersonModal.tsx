"use client";

import { useEffect, useState } from "react";
import { X, MailCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { appClient, extractErrorMessage } from "@/lib/api-client";
import { useToast } from "@/app/components/Toast";
import { ROLE_LABEL } from "@/lib/roleCreationMatrix";
import type { UserRole } from "@/lib/store/auth-store";

// The single flow for adding ANYONE to the organization — employee,
// team lead, HR admin or another super admin. It replaces the old
// InviteUserModal ("Add employee", hardcoded to EMPLOYEE) and
// InviteAdminModal ("Invite HR / Team Lead", a role picker with no job
// fields), which between them split one job across two buttons and left
// an admin guessing which to click.
//
// NOTE the two different meanings of "role" on this form:
//   - `role`    — the real UserRole enum column. Decides permissions and
//                 which dashboard they land on (see roleRoutes.ts).
//                 Enforced server-side; the dropdown only offers what
//                 ROLE_CREATION_MATRIX allows the caller to create.
//   - `jobRole` — a job title like "Backend Engineer". Descriptive only,
//                 and there is no column for it on the User model.
//
// Matches CreateUserDto (apps/api/src/users/dto/create-users.dto.ts) for
// the fields that actually get sent. phoneNumber/jobRole/workRule are
// deliberately NOT in the DTO — confirmed against prisma/schema.prisma's
// User model that none of those three columns exist at all. They're
// still collected to match the design, but stripped before the request
// and flagged to the admin.
// No employeeId field: the server generates one, prefixed by role —
// ADM-, HR-, TL-, EMP- — via generateUniqueEmployeeId() in
// apps/api/src/common/employee-id.util.ts. It's globally unique, so only
// the server can safely mint it. CreateUserDto still accepts one if sent,
// for orgs migrating from an existing HR system; this form doesn't offer
// that.
const addPersonSchema = z.object({
  role: z.string().min(1, { message: "Role is required" }),
  name: z.string().min(2, { message: "Name is required" }),
  email: z.string().email({ message: "Enter a valid email address" }),
  phoneNumber: z.string().optional(),
  departmentId: z.string().optional(),
  officeId: z.string().optional(),
  jobRole: z.string().optional(),
  workRule: z.string().optional(),
});

type AddPersonFormValues = z.infer<typeof addPersonSchema>;

interface Department {
  id: string;
  name: string;
}

// Only the two fields the dropdown needs, so this doesn't have to track
// the Office model's geo-fence columns.
interface OfficeOption {
  id: string;
  name: string;
}

interface ProvisionResponse {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  role: UserRole;
  status: string;
}

interface AddPersonModalProps {
  // ROLE_CREATION_MATRIX entry for the signed-in user. The backend
  // enforces this for real (a forbidden role returns 403); this just
  // stops the form offering something that would be rejected.
  allowedRoles: UserRole[];
  onClose: () => void;
  onInvited: () => void; // parent refetches the employee list after this fires
}

// Static placeholders — mirrors the same seeded rows Work Rules shows,
// since there's no backend WorkRule model to fetch real ones from.
const WORK_RULE_OPTIONS = ["Standard Corporate", "Night Shift (Ops)", "Field Team"];

export function AddPersonModal({
  allowedRoles,
  onClose,
  onInvited,
}: AddPersonModalProps) {
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The invited person, once created. The API emails the activation link
  // itself now and returns no token, so there is nothing left to copy —
  // this holds what the admin still needs to see afterwards.
  const [invited, setInvited] = useState<ProvisionResponse | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [offices, setOffices] = useState<OfficeOption[]>([]);

  useEffect(() => {
    // Both dropdowns are optional fields, so a failure on either one
    // shouldn't block the form — each request swallows its own error and
    // falls back to an empty list.
    Promise.all([
      appClient
        .get<Department[]>("/departments")
        .catch(() => ({ data: [] as Department[] })),
      appClient
        .get<OfficeOption[]>("/offices")
        .catch(() => ({ data: [] as OfficeOption[] })),
    ]).then(([departmentsRes, officesRes]) => {
      setDepartments(departmentsRes.data);
      setOffices(officesRes.data);
    });
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AddPersonFormValues>({
    resolver: zodResolver(addPersonSchema),
    // Defaults to EMPLOYEE when it's on offer, since that's far and away
    // the most common thing an admin is adding.
    defaultValues: {
      role: allowedRoles.includes("EMPLOYEE") ? "EMPLOYEE" : allowedRoles[0] ?? "",
    },
  });

  const onSubmit = async (values: AddPersonFormValues) => {
    setServerError(null);
    setIsSubmitting(true);
    try {
      // Only send what the backend actually accepts — phoneNumber,
      // jobRole, and workRule have nowhere to go (see note above).
      const { data } = await appClient.post<ProvisionResponse>("/users", {
        name: values.name,
        email: values.email,
        role: values.role,
        departmentId: values.departmentId || undefined,
        // Real column on the User model, validated server-side against
        // the caller's own organization (users.service.ts provision).
        officeId: values.officeId || undefined,
      });
      setInvited(data);
      toast.success(
        values.name + " added successfully",
        `An activation email is on its way to ${values.email}.`
      );
      onInvited();
    } catch (error) {
      const message = extractErrorMessage(error);
      setServerError(message);
      toast.error("Could not add this person", message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-surface rounded-xl border border-neutral/20 p-6">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-semibold text-heading">
            {invited ? "Invitation sent" : "Add person"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-neutral hover:text-heading"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {invited ? (
          <div>
            {/* The API sends the activation email itself and stores only a
                hash of the token, so there is no link to show here. The
                employee ID is surfaced instead: it is generated server-side,
                the admin has not seen it before, and it is what the person
                signs in with. */}
            <div className="mt-3 flex items-start gap-3 rounded-md border border-success/30 bg-success/10 px-3 py-3">
              <MailCheck
                className="h-5 w-5 shrink-0 text-success"
                strokeWidth={1.75}
              />
              <p className="text-sm text-heading">
                An activation email has been sent to{" "}
                <span className="font-medium wrap-break-word">{invited.email}</span>.
                They set their own password from the link inside it.
              </p>
            </div>

            <dl className="mt-4 space-y-2 rounded-md border border-neutral/30 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-neutral">Employee ID</dt>
                <dd className="text-sm font-medium text-heading">
                  {invited.employeeId}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-neutral">Role</dt>
                <dd className="text-sm font-medium text-heading">
                  {ROLE_LABEL[invited.role]}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-neutral">Status</dt>
                <dd className="text-sm font-medium text-heading">
                  {invited.status}
                </dd>
              </div>
            </dl>

            <p className="mt-3 text-xs text-neutral">
              Nothing arrived? Check the spam folder, then re-send the
              invitation from their profile.
            </p>

            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-md bg-primary text-white py-2 text-sm font-medium hover:bg-primary/90"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-neutral mb-4">
              They&apos;ll set their own password and register a device on first
              sign-in.
            </p>

            {serverError && (
              <div className="mb-4 rounded-md bg-alert/10 border border-alert/30 text-alert text-sm px-3 py-2">
                {serverError}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Role leads the form: it changes what this person can do
                  and where they land after signing in. */}
              <div>
                <label htmlFor="role" className="block text-sm font-medium text-heading mb-1">
                  Role
                </label>
                <select
                  id="role"
                  {...register("role")}
                  className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {allowedRoles.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </option>
                  ))}
                </select>
                {errors.role && (
                  <p className="mt-1 text-sm text-alert">{errors.role.message}</p>
                )}
                <p className="mt-1 text-xs text-neutral">
                  Sets their permissions and which dashboard they sign in to.
                </p>
              </div>

              {/* Full width now that Employee ID no longer shares this
                  row — a lone field in a two-column grid renders at half
                  width with an empty gap beside it. */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-heading mb-1">
                  Full name
                </label>
                <input
                  id="name"
                  type="text"
                  placeholder="Chinedu Okafor"
                  {...register("name")}
                  className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-alert">{errors.name.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-heading mb-1">
                    Work email
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="chinedu.okafor@elonatech.com.ng"
                    {...register("email")}
                    className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-alert">{errors.email.message}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="phoneNumber" className="block text-sm font-medium text-heading mb-1">
                    Phone number
                  </label>
                  <input
                    id="phoneNumber"
                    type="tel"
                    placeholder="+234 801 234 5678"
                    {...register("phoneNumber")}
                    className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Department and Office are both real, persisted columns. */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="departmentId" className="block text-sm font-medium text-heading mb-1">
                    Department
                  </label>
                  <select
                    id="departmentId"
                    {...register("departmentId")}
                    className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">No department</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="officeId" className="block text-sm font-medium text-heading mb-1">
                    Office
                  </label>
                  <select
                    id="officeId"
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

              {/* Job role and work rule are grouped together because
                  neither is persisted — see the note below the row. */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="jobRole" className="block text-sm font-medium text-heading mb-1">
                    Job title
                  </label>
                  <input
                    id="jobRole"
                    type="text"
                    placeholder="Backend Engineer"
                    {...register("jobRole")}
                    className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="mt-1 text-xs text-neutral">
                    Descriptive only — doesn&apos;t affect permissions.
                  </p>
                </div>
                <div>
                  <label htmlFor="workRule" className="block text-sm font-medium text-heading mb-1">
                    Assigned work rule
                  </label>
                  <select
                    id="workRule"
                    {...register("workRule")}
                    className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {WORK_RULE_OPTIONS.map((rule) => (
                      <option key={rule} value={rule}>
                        {rule}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-neutral">
                    Shift window, grace period and overtime thresholds.
                  </p>
                </div>
              </div>

              <p className="text-xs text-neutral border-t border-neutral/20 pt-3">
                Phone number, job title, and assigned work rule aren&apos;t
                saved yet — backend support for these is still pending.
              </p>

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
                  {isSubmitting ? "Saving..." : "Send invite"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
