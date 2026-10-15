"use client";

import { useState } from "react";
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

const TIERS: Tier[] = [
  {
    name: "Starter",
    price: "₦1,200",
    priceNote: "Indicative price — confirm before launch",
    cap: "Up to 20 employees",
    description: "Core attendance and geo-fencing for a single branch.",
    features: [
      "Biometric + geo-fenced clock-in",
      "Single branch & geo-fence",
      "Attendance history",
      "Basic reports",
    ],
    cta: { label: "Start Free Trial", href: "/auth/register" },
  },
  {
    name: "Core",
    price: "₦1,800",
    priceNote: "Indicative price — confirm before launch",
    cap: "Up to 50 employees",
    description: "Exception review and Payroll export for growing teams.",
    features: [
      "Everything in Starter",
      "HR attendance review queue",
      "Payroll export (PDF/Excel/CSV)",
      "Multiple departments",
    ],
    cta: { label: "Start Free Trial", href: "/auth/register" },
    highlighted: true,
  },
  {
    name: "Elite",
    price: "₦2,800",
    priceNote: "Indicative price — confirm before launch",
    cap: "Up to 100 employees",
    description: "Advanced reporting and Multi-branch support for established operations.",
    features: [
      "Everything in Core",
      "Advanced reports",
      "Multi-branch support",
      "Team Lead dashboards",
    ],
    cta: { label: "Start Free Trial", href: "/auth/register" },
  },
  {
    name: "Enterprise",
    price: "Custom",
    cap: "100+ employees",
    description: "Multi-office deployments with Single Sign-On, audit tooling, and dedicated support.",
    features: [
      "Everything in Elite",
      "Multi-office support",
      "Single Sign-On & custom password policy",
      "Dedicated support",
    ],
    cta: { label: "Contact Sales", href: "/contact" },
  },
];

export function Pricing() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");

  return (
    <section id="pricing" className="bg-background py-20">
      <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-16">
        <h2 className="text-3xl font-semibold text-heading">Pricing</h2>
        <p className="mt-2 text-neutral">
          Billed in Naira. Choose monthly or annual billing for any plan.
        </p>

        {/* Billing Toggle */}
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={() => setBillingPeriod("monthly")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              billingPeriod === "monthly"
                ? "bg-primary text-white"
                : "bg-neutral/10 text-neutral hover:bg-neutral/20"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingPeriod("annual")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              billingPeriod === "annual"
                ? "bg-primary text-white"
                : "bg-neutral/10 text-neutral ring-1 ring-success hover:bg-neutral/20"
            }`}
          >
            Annual{" "}
            {/* Was plain small grey text, "(20% off)", inside the button —
                someone shown this page didn't notice the discount until it
                was pointed out. A solid green pill is the one element on
                the toggle that isn't blue or grey, so it reads as an offer
                in both themes and in both selected and unselected states.
                Green on purpose, not red: red says "loss" or "warning",
                and this is a saving. The thin green ring on the unselected
                button above is the same colour for the same reason, so the
                two read as one signal. */}
            <span className="ml-1.5 rounded-full bg-success px-2 py-0.5 text-xs font-semibold text-white">
              Save 20%
            </span>
          </button>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-4">
          {TIERS.map((tier) => {
            const monthlyPrice = parseInt(tier.price.replace("₦", "").replace(",", ""));
            const annualPrice = Math.floor(monthlyPrice * 12 * 0.8); // 20% discount for annual
            const displayPrice = billingPeriod === "monthly" ? monthlyPrice : annualPrice;

            // One set of classes for both themes. These used to carry
            // dark: overrides that flattened Starter/Elite/Enterprise to
            // slate and turned Core solid blue, so dark mode lost the
            // per-tier tints the light design is built on. The colour
            // tokens (surface, heading, neutral, primary...) already
            // adapt to dark on their own, so nothing needs overriding.
            //
            // The exception is Core. Tinted-over-dark, its see-through blue
            // read almost the same as Starter's dark surface, so the
            // "Most Popular" card stopped standing out. In dark mode it
            // goes back to solid primary, with the white text and slate
            // button/badge that need (the `dark:` classes on Core below).
            const cardStyle = {
              Starter: "border-neutral/20 bg-surface",
              Core: "border-primary bg-primary/10 shadow-2xl dark:bg-primary dark:text-white dark:border-primary",
              Elite: "border-success bg-success/10",
              Enterprise: "border-warning bg-warning/10",
            }[tier.name] || "border-neutral/20 bg-surface";

            return (
              <div
                key={tier.name}
                className={`relative flex flex-col rounded-xl border p-6 ${cardStyle}`}
              >
                {tier.highlighted && (
                  <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-xs font-medium text-white dark:bg-slate-800 dark:text-white">
                    Most Popular
                  </span>
                )}

                <h3 className={`text-sm font-semibold text-heading ${tier.highlighted ? "dark:text-white" : ""}`}>
                  {tier.name}
                </h3>

                <div className="mt-3">
                  <span className="text-3xl font-semibold text-heading">
                    {tier.price === "Custom" ? "Custom" : `₦${displayPrice.toLocaleString()}`}
                  </span>
                  {tier.price !== "Custom" && (
                    <span className={`text-sm text-neutral ${tier.highlighted ? "dark:text-white/80" : ""}`}>
                      {billingPeriod === "monthly" ? "/month" : "/year"}
                    </span>
                  )}
                </div>
                <p className={`mt-1 text-xs text-neutral ${tier.highlighted ? "dark:text-white/70" : ""}`}>{tier.cap}</p>
                {tier.priceNote && (
                  <p className="mt-1 text-[11px] italic text-warning">
                    {tier.priceNote}
                  </p>
                )}

                <p className={`mt-4 text-sm text-neutral ${tier.highlighted ? "dark:text-white/80" : ""}`}>{tier.description}</p>

                <ul className="mt-5 space-y-2.5 flex-1">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-success"
                        strokeWidth={2}
                      />
                      <span className={`text-sm text-neutral ${tier.highlighted ? "dark:text-white/80" : ""}`}>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={tier.cta.href}
                  className={`mt-6 rounded-md px-4 py-2 text-center text-sm font-medium transition-colors ${
                    {
                      Starter: "border border-neutral/30 text-heading hover:bg-neutral/10",
                      Core: "bg-primary text-white hover:bg-primary/90 dark:bg-slate-800 dark:text-white dark:border dark:border-slate-600 dark:hover:bg-slate-700",
                      Elite: "border border-success text-heading hover:bg-success/10",
                      Enterprise: "border border-warning text-heading hover:bg-warning/10",
                    }[tier.name] || "border border-neutral/30 text-heading hover:bg-neutral/10"
                  }`}
                >
                  {tier.cta.label}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
