"use client";

import { useEffect, useState } from "react";
import { X, Copy, Check } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { appClient, extractErrorMessage } from "@/lib/api-client";
import type { UserRole } from "@/lib/store/auth-store";

// "Add employee" always creates a plain EMPLOYEE — matches the
// reference design (no Role field at all here). Inviting an HR Admin
// or Team Lead is a separate, deliberately simpler flow — see
// InviteAdminModal.tsx — since those need a role picker and don't need
// job-detail fields like this one does.
//
// Matches CreateUserDto exactly (apps/api/src/users/dto/create-users.dto.ts)
// for the fields that actually get sent. phoneNumber/jobRole/workRuleId
// are deliberately NOT in the DTO — confirmed against prisma/schema.prisma's
// User model that none of those three columns exist on the backend at
// all (not "not wired up yet" like the map picker — there's genuinely
// nowhere to store them). They're still collected below to match the
// design, but stripped before the request and flagged to the admin.
const addEmployeeSchema = z.object({
  employeeId: z.string().min(1, { message: "Employee ID is required" }),
  name: z.string().min(2, { message: "Name is required" }),
  email: z.string().email({ message: "Enter a valid email address" }),
  phoneNumber: z.string().optional(),
  departmentId: z.string().optional(),
  officeId: z.string().optional(),
  jobRole: z.string().optional(),
  workRule: z.string().optional(),
});

type AddEmployeeFormValues = z.infer<typeof addEmployeeSchema>;

interface Department {
  id: string;
  name: string;
}

// Same shape as the Office model's list response — only the two fields
// the dropdown needs, so this doesn't have to track geo-fence columns.
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
  // TEMPORARY on the backend — see users.service.ts's comment on this
  // field: returned directly in the response only because no email
  // service exists yet.
  activationToken: string;
}

interface InviteUserModalProps {
  onClose: () => void;
  onInvited: () => void; // parent refetches the employee list after this fires
}

// Static placeholders — mirrors the same seeded rows Work Rules shows,
// since there's no backend WorkRule model to fetch real ones from.
const WORK_RULE_OPTIONS = ["Standard Corporate", "Night Shift (Ops)", "Field Team"];

export function InviteUserModal({ onClose, onInvited }: InviteUserModalProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activationLink, setActivationLink] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
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
  } = useForm<AddEmployeeFormValues>({
    resolver: zodResolver(addEmployeeSchema),
  });

  const onSubmit = async (values: AddEmployeeFormValues) => {
    setServerError(null);
    setIsSubmitting(true);
    try {
      // Only send what the backend actually accepts — phoneNumber,
      // jobRole, and workRule have nowhere to go (see note above).
      const { data } = await appClient.post<ProvisionResponse>("/users", {
        employeeId: values.employeeId,
        name: values.name,
        email: values.email,
        role: "EMPLOYEE",
        departmentId: values.departmentId || undefined,
        // Real column on the User model, validated server-side against
        // the caller's own organization (users.service.ts provision).
        officeId: values.officeId || undefined,
      });
      setActivationLink(`${window.location.origin}/auth/activate?token=${data.activationToken}`);
      onInvited();
    } catch (error) {
      setServerError(extractErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  function handleCopy() {
    if (!activationLink) return;
    navigator.clipboard.writeText(activationLink);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-xl bg-surface rounded-xl border border-neutral/20 p-6">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-semibold text-heading">
            {activationLink ? "Invite sent" : "Add employee"}
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

        {activationLink ? (
          <div>
            <p className="text-sm text-neutral mb-3 mt-3">
              No email service is set up yet — copy this activation link and
              send it to them directly (Slack, WhatsApp, whatever works).
            </p>
            <div className="flex items-center gap-2 rounded-md border border-neutral/40 px-3 py-2 bg-neutral/5">
              <span className="text-xs text-heading truncate flex-1">
                {activationLink}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                aria-label="Copy link"
                className="shrink-0 text-primary hover:text-primary/80"
              >
                {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
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
              Employees receive an invite email and register their device on
              first sign-in.
            </p>

            {serverError && (
              <div className="mb-4 rounded-md bg-alert/10 border border-alert/30 text-alert text-sm px-3 py-2">
                {serverError}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="employeeId" className="block text-sm font-medium text-heading mb-1">
                    Employee ID
                  </label>
                  <input
                    id="employeeId"
                    type="text"
                    placeholder="EMP-1204"
                    {...register("employeeId")}
                    className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {errors.employeeId && (
                    <p className="mt-1 text-sm text-alert">{errors.employeeId.message}</p>
                  )}
                </div>
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
                    type="text"
                    placeholder="+234 803 000 0000"
                    {...register("phoneNumber")}
                    className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

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
                  {/* <p className="mt-1 text-xs text-neutral">
                    Sets the geo-fence this employee clocks in against.
                  </p> */}
                </div>
              </div>

              {/* Job role and work rule are grouped together because
                  neither is persisted — see the note below the row. */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="jobRole" className="block text-sm font-medium text-heading mb-1">
                    Job role
                  </label>
                  <input
                    id="jobRole"
                    type="text"
                    placeholder="Backend Engineer"
                    {...register("jobRole")}
                    className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
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
                  {/* <p className="mt-1 text-xs text-neutral">
                    Determines shift window, grace period and overtime thresholds.
                  </p> */}
                </div>
              </div>

              <p className="text-xs text-neutral border-t border-neutral/20 pt-3">
                Phone number, job role, and assigned work rule aren&apos;t saved
                yet — backend support for these is still pending.
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
                  {isSubmitting ? "Saving..." : "Save employee"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
