import {
  Building2,
  Store,
  HeartPulse,
  Factory,
  MapPinned,
  Network,
  type LucideIcon,
} from "lucide-react";

interface Industry {
  icon: LucideIcon;
  title: string;
  description: string;
}

const INDUSTRIES: Industry[] = [
  {
    icon: Building2,
    title: "Corporate Offices",
    description: "Replace the paper register at reception with verified, timestamped check-ins.",
  },
  {
    icon: Store,
    title: "Retail Chains",
    description: "Track staff across multiple store locations, each with its own geo-fence.",
  },
  {
    icon: HeartPulse,
    title: "Healthcare",
    description: "Prove shift coverage on wards and clinics, night shifts included.",
  },
  {
    icon: Factory,
    title: "Manufacturing",
    description: "Handle plant shift patterns and overtime without queueing at a punch clock.",
  },
  {
    icon: MapPinned,
    title: "Field & Remote Teams",
    description: "Let engineers and reps clock in at client sites, verified by GPS.",
  },
  {
    icon: Network,
    title: "Multi-Branch Enterprises",
    description: "One view of attendance across every branch, department, and city.",
  },
];

export function WhoItsFor() {
  return (
    <section className="bg-neutral/[0.03] py-20">
      <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-16">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Who it&apos;s for
        </p>
        <h2 className="mt-2 text-3xl font-semibold text-heading">
          Built for teams that don&apos;t all sit in one room
        </h2>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {INDUSTRIES.map((industry) => {
            const Icon = industry.icon;
            return (
              <div
                key={industry.title}
                className="rounded-xl border border-neutral/15 bg-surface p-5 transition-shadow hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-heading">
                  {industry.title}
                </h3>
                <p className="mt-1.5 text-sm text-neutral">
                  {industry.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
