const STEPS = [
  "Organization",
  "Office",
  "Work Rules",
  "Departments",
  "Invite Team",
  "Done",
];

interface StepProgressProps {
  currentStep: number; // 1-indexed, matches the wizard's step numbering
}

export function StepProgress({ currentStep }: StepProgressProps) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((label, index) => {
        const stepNumber = index + 1;
        const isComplete = stepNumber < currentStep;
        const isActive = stepNumber === currentStep;

        return (
          <div key={label} className="flex items-center gap-2 flex-1">
            <div
              className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-medium
                ${isComplete ? "bg-primary text-white" : ""}
                ${isActive ? "bg-primary text-white" : ""}
                ${!isComplete && !isActive ? "bg-neutral/20 text-neutral" : ""}
              `}
            >
              {stepNumber}
            </div>
            {/* Connector line between steps — skip after the last one */}
            {stepNumber < STEPS.length && (
              <div
                className={`h-0.5 flex-1 ${
                  isComplete ? "bg-primary" : "bg-neutral/20"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
