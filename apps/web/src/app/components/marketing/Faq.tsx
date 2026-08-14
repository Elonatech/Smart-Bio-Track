"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface FaqItem {
  question: string;
  answer: string;
}

// Deliberately capped at 4 — the most important questions a
// first-time, non-technical visitor would actually ask, not an
// exhaustive knowledge base.
const FAQS: FaqItem[] = [
  {
    question: "Is our employees' biometric data stored on your servers?",
    answer:
      "No. Face ID / fingerprint verification happens entirely on the employee's own device, at the operating-system level. We only ever receive a pass/fail result — never the biometric image or template itself.",
  },
  {
    question: "What happens if GPS or location signal is weak?",
    answer:
      "A weak signal doesn't cause an automatic rejection. It lowers the overall Trust Score, which routes the punch to your HR team's review queue instead of silently approving or rejecting it — a person makes the final call, with full context.",
  },
  {
    question: "Can we use this across multiple office locations?",
    answer:
      "Yes. Every office gets its own geo-fence and can have its own work rules and grace periods. Starter supports one office; Pro and above support multiple.",
  },
  {
    question: "How is pricing calculated?",
    answer:
      "Pricing is per active employee, per month, billed to your organization. Suspended or removed employees stop counting toward your bill starting the next billing cycle.",
  },
];

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="bg-neutral/[0.03] py-20">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="text-3xl font-semibold text-heading">
          Frequently asked questions
        </h2>

        <div className="mt-8 divide-y divide-neutral/15 rounded-xl border border-neutral/15 bg-surface">
          {FAQS.map((item, index) => {
            const isOpen = index === openIndex;
            return (
              <div key={item.question}>
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left"
                >
                  <span className="text-sm font-medium text-heading">
                    {item.question}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-neutral transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 text-sm text-neutral">
                    {item.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
