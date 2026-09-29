const STEPS = [
  "Organization",
  "First office",
  "Work rules",
  "Departments",
  "Invites",
  "Done",
];

interface StepProgressProps {
  currentStep: number; // 1-indexed, matches the wizard's step numbering
}

export function StepProgress({ currentStep }: StepProgressProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-8">
      {STEPS.map((label, index) => {
        const stepNumber = index + 1;
        const isComplete = stepNumber < currentStep;
        const isActive = stepNumber === currentStep;

        return (
          <div
            key={label}
            className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium whitespace-nowrap
              ${isActive ? "bg-primary border-primary text-white" : ""}
              ${isComplete ? "bg-success/10 border-success/40 text-success" : ""}
              ${!isActive && !isComplete ? "border-neutral/30 text-neutral" : ""}
            `}
          >
            {isComplete ? (
              <span
                aria-hidden
                className="h-4 w-4 shrink-0 rounded-full bg-success/20 text-success flex items-center justify-center text-[10px]"
              >
                &#10003;
              </span>
            ) : (
              <span
                className={`h-4 w-4 shrink-0 rounded-full flex items-center justify-center text-[10px]
                  ${isActive ? "bg-white/20 text-white" : "bg-neutral/20 text-neutral"}
                `}
              >
                {stepNumber}
              </span>
            )}
            {label}
          </div>
        );
      })}
    </div>
  );
}
