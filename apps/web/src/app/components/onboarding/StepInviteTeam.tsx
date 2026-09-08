import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import {
  inviteTeamSchema,
  type InviteTeamValues,
} from "@/lib/validation/onboarding";

interface StepInviteTeamProps {
  defaultValues?: Partial<InviteTeamValues>;
  /** Department names captured in the previous step. */
  departmentNames: string[];
  onNext: (values: InviteTeamValues) => void;
  onBack?: () => void;
}

const StepInviteTeam = ({
  defaultValues,
  departmentNames,
  onNext,
  onBack,
}: StepInviteTeamProps) => {
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<InviteTeamValues>({
    resolver: zodResolver(inviteTeamSchema),
    defaultValues: {
      invites: [],
      ...defaultValues,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "invites",
  });

  // Watched so the department field can mark itself required the moment a
  // row is switched to Team Lead, rather than only on submit.
  const invites = watch("invites");

  const onSubmit = (values: InviteTeamValues) => {
    onNext(values);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* One card per invitee rather than one row: four fields don't fit
          across a row at this width, and a wrapped row makes it unclear
          which field belongs to which person. */}
      <div className="space-y-3">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="rounded-md border border-neutral/30 p-3 space-y-2"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  placeholder="Full name"
                  {...register(`invites.${index}.name`)}
                  className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {errors.invites?.[index]?.name && (
                  <p className="mt-1 text-sm text-alert">
                    {errors.invites[index]?.name?.message}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label="Remove invite"
                className="shrink-0 h-9 w-9 flex items-center justify-center rounded-md border border-alert/30 text-alert hover:bg-alert/10"
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            {/* No Employee ID field — the server generates a role-prefixed
                one (HR-7K2X9, TL-…, EMP-…). */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <input
                  type="email"
                  placeholder="name@company.com"
                  {...register(`invites.${index}.email`)}
                  className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {errors.invites?.[index]?.email && (
                  <p className="mt-1 text-sm text-alert">
                    {errors.invites[index]?.email?.message}
                  </p>
                )}
              </div>

              <select
                {...register(`invites.${index}.role`)}
                className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="HR_ADMIN">HR Administrator</option>
                <option value="TEAM_LEAD">Team Lead</option>
                <option value="EMPLOYEE">Employee</option>
              </select>
            </div>

            {/* Department is collected here rather than left for later
                because there is no PATCH /users/:id yet — an invite sent
                without one cannot be corrected from the dashboard at all.
                Values are department NAMES; they have no ids until the
                wizard finishes and creates them. */}
            <div>
              <select
                {...register(`invites.${index}.department`)}
                className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">
                  {invites?.[index]?.role === "TEAM_LEAD"
                    ? "Select a department (required)"
                    : "No department yet (optional)"}
                </option>
                {departmentNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              {errors.invites?.[index]?.department && (
                <p className="mt-1 text-sm text-alert">
                  {errors.invites[index]?.department?.message}
                </p>
              )}
              {invites?.[index]?.role === "TEAM_LEAD" && (
                <p className="mt-1 text-xs text-neutral">
                  A Team Lead&apos;s dashboard only shows their own
                  department&apos;s attendance.
                </p>
              )}
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            append({ name: "", email: "", role: "TEAM_LEAD", department: "" })
          }
          className="w-full rounded-md border border-neutral/30 py-2 text-sm font-medium text-heading hover:bg-neutral/10"
        >
          + Add another invite
        </button>
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
};

export default StepInviteTeam;
