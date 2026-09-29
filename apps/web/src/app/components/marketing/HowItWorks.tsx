interface Step {
  number: number;
  text: string;
}

const ORG_STEPS: Step[] = [
  { number: 1, text: "Set up offices, geo-fences, and work rules" },
  { number: 2, text: "Invite employees, HR admins, and team leads" },
  { number: 3, text: "Monitor attendance in real time" },
];

const EMPLOYEE_STEPS: Step[] = [
  { number: 1, text: "Register your device" },
  { number: 2, text: "Clock in with biometric + location" },
  { number: 3, text: "Done in seconds" },
];

function StepList({ title, steps }: { title: string; steps: Step[] }) {
  return (
    <div className="rounded-xl border border-neutral/15 bg-surface p-6">
      <h3 className="text-sm font-semibold text-heading">{title}</h3>
      <ol className="mt-4 space-y-3">
        {steps.map((step) => (
          <li key={step.number} className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {step.number}
            </span>
            <span className="text-sm text-neutral">{step.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section className="bg-background py-20">
      <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-16">
        <h2 className="text-3xl font-semibold text-heading">How it works</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <StepList title="For Organizations" steps={ORG_STEPS} />
          <StepList title="For Employees" steps={EMPLOYEE_STEPS} />
        </div>
      </div>
    </section>
  );
}
