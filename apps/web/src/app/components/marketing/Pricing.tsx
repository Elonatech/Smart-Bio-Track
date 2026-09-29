import Link from "next/link";
import { Check } from "lucide-react";

interface Tier {
  name: string;
  price: string; // "Custom" for Enterprise
  priceNote?: string;
  cap: string;
  description: string;
  features: string[];
  cta: { label: string; href: string };
  highlighted?: boolean;
}

// NOTE: Pro and Professional prices below are PLACEHOLDERS — confirm
// real numbers before this ever goes live. Starter's rate is the only
// one currently validated.
const TIERS: Tier[] = [
  {
    name: "Starter",
    price: "₦1,200",
    cap: "Up to 20 employees",
    description: "Core attendance and geo-fencing for a single office.",
    features: [
      "Biometric + geo-fenced clock-in",
      "Single office & geo-fence",
      "Attendance history",
      "Basic reports",
    ],
    cta: { label: "Start Free Trial", href: "/auth/register" },
  },
  {
    name: "Pro",
    price: "₦1,800",
    priceNote: "Indicative price — confirm before launch",
    cap: "Up to 50 employees",
    description: "Exception review and multi-office support for growing teams.",
    features: [
      "Everything in Starter",
      "HR exception review queue",
      "Multi-office support",
      "Departments & work rules",
    ],
    cta: { label: "Start Free Trial", href: "/auth/register" },
    highlighted: true,
  },
  {
    name: "Professional",
    price: "₦2,800",
    priceNote: "Indicative price — confirm before launch",
    cap: "Up to 100 employees",
    description: "Advanced reporting and payroll workflows for established operations.",
    features: [
      "Everything in Pro",
      "Advanced reports",
      "Payroll export (PDF/Excel/CSV)",
      "Team Lead dashboards",
    ],
    cta: { label: "Start Free Trial", href: "/auth/register" },
  },
  {
    name: "Enterprise",
    price: "Custom",
    cap: "100+ employees",
    description: "Multi-branch deployments with SSO, audit tooling, and dedicated support.",
    features: [
      "Everything in Professional",
      "Multi-branch / multi-tenant",
      "SSO & custom password policy",
      "Dedicated support",
    ],
    cta: { label: "Contact Sales", href: "/contact" },
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="bg-background py-20">
      <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-16">
        <h2 className="text-3xl font-semibold text-heading">Pricing</h2>
        <p className="mt-2 text-neutral">
          Billed monthly in Naira, per active employee. Annual contracts
          available on every paid plan.
        </p>

        <div className="mt-10 grid gap-5 lg:grid-cols-4">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`relative flex flex-col rounded-xl border p-6 ${
                tier.highlighted
                  ? "border-primary shadow-lg"
                  : "border-neutral/20"
              }`}
            >
              {tier.highlighted && (
                <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-xs font-medium text-white">
                  Most Popular
                </span>
              )}

              <h3 className="text-sm font-semibold text-heading">
                {tier.name}
              </h3>

              <div className="mt-3">
                <span className="text-3xl font-semibold text-heading">
                  {tier.price}
                </span>
                {tier.price !== "Custom" && (
                  <span className="text-sm text-neutral"> /employee/month</span>
                )}
              </div>
              <p className="mt-1 text-xs text-neutral">{tier.cap}</p>
              {tier.priceNote && (
                <p className="mt-1 text-[11px] italic text-warning">
                  {tier.priceNote}
                </p>
              )}

              <p className="mt-4 text-sm text-neutral">{tier.description}</p>

              <ul className="mt-5 space-y-2.5 flex-1">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-success"
                      strokeWidth={2}
                    />
                    <span className="text-sm text-neutral">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={tier.cta.href}
                className={`mt-6 rounded-md px-4 py-2 text-center text-sm font-medium transition-colors ${
                  tier.highlighted
                    ? "bg-primary text-white hover:bg-primary/90"
                    : "border border-neutral/30 text-heading hover:bg-neutral/10"
                }`}
              >
                {tier.cta.label}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
