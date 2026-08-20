import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import {
  departmentsSchema,
  type DepartmentsValues,
} from "@/lib/validation/onboarding";

interface StepDepartmentsProps {
  defaultValues?: Partial<DepartmentsValues>;
  onNext: (values: DepartmentsValues) => void;
  onBack?: () => void;
}

const StepDepartments = ({
  defaultValues,
  onNext,
  onBack,
}: StepDepartmentsProps) => {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<DepartmentsValues>({
    resolver: zodResolver(departmentsSchema),
    defaultValues: {
      departments: [{ name: "" }],
      ...defaultValues,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "departments",
  });

  const onSubmit = (values: DepartmentsValues) => {
    onNext(values);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        {fields.map((field, index) => (
          <div key={field.id} className="flex items-center gap-2">
            <div className="flex-1">
              <input
                type="text"
                placeholder="e.g. Engineering"
                {...register(`departments.${index}.name`)}
                className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {errors.departments?.[index]?.name && (
                <p className="mt-1 text-sm text-alert">
                  {errors.departments[index]?.name?.message}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => remove(index)}
              disabled={fields.length === 1}
              aria-label="Remove department"
              className="shrink-0 h-9 w-9 flex items-center justify-center rounded-md border border-alert/30 text-alert hover:bg-alert/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        ))}

        {errors.departments?.root && (
          <p className="text-sm text-alert">{errors.departments.root.message}</p>
        )}
        {errors.departments?.message && (
          <p className="text-sm text-alert">{errors.departments.message}</p>
        )}

        <button
          type="button"
          onClick={() => append({ name: "" })}
          className="w-full rounded-md border border-neutral/30 py-2 text-sm font-medium text-heading hover:bg-neutral/10"
        >
          + Add another department
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

export default StepDepartments;
