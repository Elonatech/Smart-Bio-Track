"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MailCheck } from "lucide-react";
import { Navbar } from "../components/marketing/Navbar";
import { Footer } from "../components/marketing/Footer";
import { useToast } from "@/app/components/Toast";

// Same approach as /contact: no backend endpoint exists, so this drafts
// a mailto rather than shipping a dead button. Swap `onSubmit` when a
// real endpoint or form service lands.
//
// Kept separate from /contact deliberately. A demo request is a
// qualified sales lead and needs company, size and phone; a support
// question doesn't. Putting both in one form makes the common case
// longer for everyone.
const SALES_EMAIL = "sales@elonatech.com.ng";

const COMPANY_SIZES = [
  "1–50 employees",
  "51–200 employees",
  "201–1,000 employees",
  "1,000+ employees",
];

const demoSchema = z.object({
  name: z.string().min(2, { message: "Your name is required" }),
  email: z.string().email({ message: "Enter a valid work email" }),
  company: z.string().min(2, { message: "Company name is required" }),
  companySize: z.string().min(1, { message: "Pick a company size" }),
  // Optional, but validated when filled — a malformed number is worse
  // than none, because sales will try it and lose the lead.
  phone: z
    .string()
    .optional()
    .refine(
      (value) => !value || /^\+?[\d\s()-]{7,20}$/.test(value),
      { message: "Enter a valid phone number, e.g. +234 803 000 0000" }
    ),
  message: z.string().optional(),
});

type DemoFormValues = z.infer<typeof demoSchema>;

export default function DemoPage() {
  const toast = useToast();
  const [isSent, setIsSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DemoFormValues>({
    resolver: zodResolver(demoSchema),
    defaultValues: { companySize: COMPANY_SIZES[2] },
  });

  const onSubmit = (values: DemoFormValues) => {
    const subject = encodeURIComponent(
      `Demo request — ${values.company}`
    );
    const body = encodeURIComponent(
      [
        values.message?.trim() || "Requesting a product demo.",
        "",
        "—",
        `Name: ${values.name}`,
        `Company: ${values.company}`,
        `Size: ${values.companySize}`,
        `Email: ${values.email}`,
        values.phone ? `Phone: ${values.phone}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    );

    window.location.href = `mailto:${SALES_EMAIL}?subject=${subject}&body=${body}`;
    setIsSent(true);
    toast.success(
      "Demo request drafted successfully",
      "Press send in your email app and we will reply within one working day."
    );
  };

  const fieldClass =
    "w-full rounded-md border border-neutral/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-16 py-16 lg:py-24">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            {/* LEFT — what they're actually signing up for. Setting
                expectations (length, format, who to bring) is what makes
                a demo request feel low-risk enough to send. */}
            <div>
              <h1 className="text-4xl sm:text-5xl font-semibold text-heading">
                Book a demo
              </h1>
              <p className="mt-4 text-neutral max-w-md">
                See a live clock-in evaluated by the Trust Score Engine, then
                walk the HR review queue and audit log with one of our solution
                engineers.
              </p>

              <div className="mt-8 space-y-3 text-sm text-neutral max-w-md">
                <p>
                  Typical demo runs 30 minutes, remote or on-site in Lagos and
                  Abuja.
                </p>
                <p>
                  Bring your security lead — we cover attestation and data
                  handling in detail.
                </p>
              </div>

              <p className="mt-8 text-sm text-neutral">
                Sales:{" "}
                <a
                  href="tel:+2348030004412"
                  className="hover:text-heading transition-colors"
                >
                  +234 803 000 4412
                </a>{" "}
                ·{" "}
                <a
                  href={`mailto:${SALES_EMAIL}`}
                  className="hover:text-heading transition-colors break-words"
                >
                  {SALES_EMAIL}
                </a>
              </p>
            </div>

            {/* RIGHT — the form, or its confirmation */}
            <div className="rounded-2xl border border-neutral/20 bg-surface p-6 sm:p-8">
              {isSent ? (
                <div className="text-center py-6">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
                    <MailCheck className="h-6 w-6" strokeWidth={1.75} />
                  </span>
                  <h2 className="mt-4 text-xl font-semibold text-heading">
                    Your email client should have opened
                  </h2>
                  <p className="mt-2 text-sm text-neutral">
                    Your demo request is drafted and addressed — press send
                    there and we&apos;ll come back within one working day.
                  </p>
                  <p className="mt-4 text-sm text-neutral">
                    Nothing opened? Write to us at{" "}
                    <a
                      href={`mailto:${SALES_EMAIL}`}
                      className="font-medium text-primary hover:underline break-words"
                    >
                      {SALES_EMAIL}
                    </a>
                    .
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsSent(false)}
                    className="mt-6 text-sm font-medium text-primary hover:underline"
                  >
                    Edit the request
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="name"
                        className="block text-sm font-medium text-heading mb-1"
                      >
                        Full name
                      </label>
                      <input
                        id="name"
                        type="text"
                        placeholder="Chinelo Umeh"
                        {...register("name")}
                        className={fieldClass}
                      />
                      {errors.name && (
                        <p className="mt-1 text-sm text-alert">
                          {errors.name.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="email"
                        className="block text-sm font-medium text-heading mb-1"
                      >
                        Work email
                      </label>
                      <input
                        id="email"
                        type="email"
                        placeholder="chinelo@company.com.ng"
                        {...register("email")}
                        className={fieldClass}
                      />
                      {errors.email && (
                        <p className="mt-1 text-sm text-alert">
                          {errors.email.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="company"
                        className="block text-sm font-medium text-heading mb-1"
                      >
                        Company
                      </label>
                      <input
                        id="company"
                        type="text"
                        placeholder="Meridian Group"
                        {...register("company")}
                        className={fieldClass}
                      />
                      {errors.company && (
                        <p className="mt-1 text-sm text-alert">
                          {errors.company.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="companySize"
                        className="block text-sm font-medium text-heading mb-1"
                      >
                        Company size
                      </label>
                      <select
                        id="companySize"
                        {...register("companySize")}
                        className={fieldClass}
                      >
                        {COMPANY_SIZES.map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="phone"
                      className="block text-sm font-medium text-heading mb-1"
                    >
                      Phone <span className="text-neutral">(optional)</span>
                    </label>
                    <input
                      id="phone"
                      type="tel"
                      placeholder="+234 803 000 0000"
                      {...register("phone")}
                      className={fieldClass}
                    />
                    {errors.phone ? (
                      <p className="mt-1 text-sm text-alert">
                        {errors.phone.message}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-neutral">
                        Nigerian format, e.g. +234 803 000 0000
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="message"
                      className="block text-sm font-medium text-heading mb-1"
                    >
                      Anything we should know?{" "}
                      <span className="text-neutral">(optional)</span>
                    </label>
                    <textarea
                      id="message"
                      rows={5}
                      placeholder="We run three offices in Lagos and Port Harcourt and need geo-fenced clock-in for field teams."
                      {...register("message")}
                      className={fieldClass}
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full rounded-md bg-primary text-white py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Request demo
                  </button>

                  <p className="text-xs text-neutral text-center">
                    Opens in your email app so you keep a copy of what you sent.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
