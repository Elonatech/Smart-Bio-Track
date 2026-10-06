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
    name: "Core",
    price: "₦1,800",
    priceNote: "Indicative price — confirm before launch",
    cap: "Up to 50 employees",
    description: "Exception review and Payroll export for growing teams.",
    features: [
      "Everything in Starter",
      "HR exception review queue",
      "Payroll export (PDF/Excel/CSV)",
      "Departments",
    ],
    cta: { label: "Start Free Trial", href: "/auth/register" },
    highlighted: true,
  },
  {
    name: "Elite",
    price: "₦2,800",
    priceNote: "Indicative price — confirm before launch",
    cap: "Up to 100 employees",
    description: "Advanced reporting and Multi-office support for established operations.",
    features: [
      "Everything in Pro",
      "Advanced reports",
      "Multi-office support",
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
                : "bg-neutral/10 text-neutral hover:bg-neutral/20"
            }`}
          >
            Annual <span className="ml-1 text-xs">(20% off)</span>
          </button>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-4">
          {TIERS.map((tier) => {
            const monthlyPrice = parseInt(tier.price.replace("₦", "").replace(",", ""));
            const annualPrice = Math.floor(monthlyPrice * 12 * 0.8); // 20% discount for annual
            const displayPrice = billingPeriod === "monthly" ? monthlyPrice : annualPrice;

            const cardStyle = {
              Starter: "border-neutral/20 bg-surface dark:bg-slate-800",
              Core: "border-primary bg-primary/10 shadow-2xl dark:bg-primary dark:text-white dark:border-primary",
              Elite: "border-success bg-success/10 dark:bg-slate-800 dark:border-neutral/20",
              Enterprise: "border-warning bg-warning/10 dark:bg-slate-800 dark:border-neutral/20",
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
                      Starter: "border border-neutral/30 text-heading hover:bg-neutral/10 dark:hover:bg-slate-700 dark:text-white",
                      Core: "bg-primary text-white hover:bg-primary/90 dark:bg-slate-800 dark:text-white dark:border dark:border-slate-600 dark:hover:bg-slate-700",
                      Elite: "border border-success text-heading hover:bg-success/10 dark:hover:bg-slate-700 dark:text-white",
                      Enterprise: "border border-warning text-heading hover:bg-warning/10 dark:hover:bg-slate-700 dark:text-white",
                    }[tier.name] || "border border-neutral/30 text-heading hover:bg-neutral/10 dark:hover:bg-slate-700 dark:text-white"
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
