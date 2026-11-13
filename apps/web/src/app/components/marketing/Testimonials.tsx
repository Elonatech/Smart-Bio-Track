import { Star } from "lucide-react";
import { SwipeRow } from "./SwipeRow";

interface Testimonial {
  quote: string;
  name: string;
  title: string;
  company: string;
  initials: string;
  companyName: string;
  rating: number;
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "Buddy punching used to cost us roughly 4% of monthly payroll. Six weeks after rollout across our Lagos and Abuja offices, flagged events dropped from 312 a month to 19.",
    name: "Ifeoma Adeleke",
    title: "HR Director",
    company: "Meridian Group",
    initials: "IA",
    companyName: "Meridian Group",
    rating: 5,
  },
  {
    quote:
      "Payroll reconciliation used to take three days of arguing over a paper register. It's now a single export, and the numbers hold up when finance challenges them.",
    name: "Samuel Okonjo",
    title: "Operations Manager",
    company: "Northridge Manufacturing",
    initials: "SO",
    companyName: "Northridge Manufacturing",
    rating: 5,
  },
  {
    quote:
      "No raw biometric data leaves the handset, device attestation is enforced, and every decision is reproducible from the audit log. That's what got this past our security review in one cycle.",
    name: "Yemi Balogun",
    title: "IT & Security Lead",
    company: "Crestpoint Bank",
    initials: "YB",
    companyName: "Crestpoint Bank",
    rating: 4,
  },
];

export function Testimonials() {
  return (
    <section className="bg-neutral/3 py-20">
      <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-16">
        <h2 className="text-3xl font-semibold text-heading">
          What enterprise buyers say
        </h2>

        {/* Swipes below lg — phones AND tablets, since this was a single
            stacked column until lg anyway. */}
        <SwipeRow
          label="Customer testimonials"
          until="lg"
          gridClassName="lg:grid-cols-3 lg:gap-6"
        >
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className="flex h-full flex-col rounded-xl border border-neutral/15 bg-surface p-6 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="flex p-2 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                  {t.companyName}
                </span>
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-3.5 w-3.5 ${
                        i < t.rating
                          ? "fill-warning text-warning"
                          : "text-neutral/30"
                      }`}
                    />
                  ))}
                </div>
              </div>

              <p className="mt-4 flex-1 text-sm text-neutral">
                &ldquo;{t.quote}&rdquo;
              </p>

              <div className="mt-5 flex items-center gap-3 border-t border-neutral/10 pt-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                  {t.initials}
                </span>
                <div>
                  <p className="text-sm font-medium text-heading">{t.name}</p>
                  <p className="text-xs text-neutral">
                    {t.title}, {t.company}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </SwipeRow>
      </div>
    </section>
  );
}
