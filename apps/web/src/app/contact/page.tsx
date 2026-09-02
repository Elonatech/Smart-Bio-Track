"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Clock, Mail, MailCheck, MapPin, Phone } from "lucide-react";
import { Navbar } from "../components/marketing/Navbar";
import { Footer } from "../components/marketing/Footer";
import { useToast } from "@/app/components/Toast";

const SALES_EMAIL = "testingelon1@gmail.com   ";
const SUPPORT_EMAIL = "support@elonatech.com.ng";

const TOPICS = [
  { value: "sales", label: "Sales enquiry", email: SALES_EMAIL },
  { value: "demo", label: "Book a demo", email: SALES_EMAIL },
  { value: "support", label: "Support question", email: SUPPORT_EMAIL },
  { value: "partnership", label: "Partnership", email: SALES_EMAIL },
  { value: "press", label: "Press", email: SALES_EMAIL },
] as const;

const contactSchema = z.object({
  name: z.string().min(2, { message: "Your name is required" }),
  email: z.string().email({ message: "Enter a valid email address" }),
  topic: z.string().min(1, { message: "Pick a topic" }),
  message: z
    .string()
    .min(10, { message: "Tell us a little more — at least 10 characters" }),
});

type ContactFormValues = z.infer<typeof contactSchema>;

const DETAILS = [
  {
    icon: MapPin,
    label: "Office",
    value: "14 Adeola Odeku Street, Victoria Island, Lagos, Nigeria",
    href: "https://maps.google.com/?q=14+Adeola+Odeku+Street+Victoria+Island+Lagos",
  },
  {
    icon: Phone,
    label: "Phone",
    value: "+234 803 000 4412",
    href: "tel:+2348030004412",
  },
  {
    icon: Mail,
    label: "Email",
    value: SALES_EMAIL,
    href: `mailto:${SALES_EMAIL}`,
  },
  {
    icon: Clock,
    label: "Hours",
    value: "Monday – Friday, 08:00 – 17:00 WAT",
    href: null,
  },
];

export default function ContactPage() {
  const toast = useToast();
  const [sentTo, setSentTo] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { topic: "sales" },
  });

  const onSubmit = (values: ContactFormValues) => {
    const topic = TOPICS.find((item) => item.value === values.topic) ?? TOPICS[0];

    const subject = encodeURIComponent(
      `${topic.label} — ${values.name}`
    );
    const body = encodeURIComponent(
      `${values.message}\n\n—\n${values.name}\n${values.email}`
    );

    window.location.href = `mailto:${topic.email}?subject=${subject}&body=${body}`;
    setSentTo(topic.email);
    toast.success(
      "Message drafted successfully",
      "Press send in your email app to deliver it to " + topic.email + "."
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-16 py-16 lg:py-24">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <h1 className="text-4xl sm:text-5xl font-semibold text-heading">
                Contact us
              </h1>
              <p className="mt-4 text-neutral max-w-md">
                General enquiries, support questions, partnerships or press. If
                you&apos;d rather see the product in action,{" "}
                <Link
                  href="/demo"
                  className="font-medium text-primary hover:underline"
                >
                  book a demo
                </Link>{" "}
                instead.
              </p>

              <ul className="mt-10 space-y-6">
                {DETAILS.map(({ icon: Icon, label, value, href }) => (
                  <li key={label} className="flex items-start gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-heading">
                        {label}
                      </p>
                      {href ? (
                        <a
                          href={href}
                          target={href.startsWith("http") ? "_blank" : undefined}
                          rel={
                            href.startsWith("http")
                              ? "noopener noreferrer"
                              : undefined
                          }
                          className="text-sm text-neutral hover:text-heading transition-colors wrap-break-word"
                        >
                          {value}
                        </a>
                      ) : (
                        <p className="text-sm text-neutral">{value}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* RIGHT — the form, or its confirmation */}
            <div className="rounded-2xl border border-neutral/20 bg-surface p-6 sm:p-8">
              {sentTo ? (
                <div className="text-center py-6">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
                    <MailCheck className="h-6 w-6" strokeWidth={1.75} />
                  </span>
                  <h2 className="mt-4 text-xl font-semibold text-heading">
                    Your email client should have opened
                  </h2>
                  <p className="mt-2 text-sm text-neutral">
                    Your message is drafted and addressed — press send there to
                    deliver it.
                  </p>
                 
                  <p className="mt-4 text-sm text-neutral">
                    Nothing opened? Write to us directly at
                    <a
                      href={`mailto:${sentTo}`}
                      className="font-medium text-primary hover:underline wrap-break-word"
                    >
                      {sentTo}
                    </a>
                    .
                  </p>
                  <button
                    type="button"
                    onClick={() => setSentTo(null)}
                    className="mt-6 text-sm font-medium text-primary hover:underline"
                  >
                    Write another message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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
                      className="w-full rounded-md border border-neutral/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      placeholder="chinelo@company.com.ng"
                      {...register("email")}
                      className="w-full rounded-md border border-neutral/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {errors.email && (
                      <p className="mt-1 text-sm text-alert">
                        {errors.email.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="topic"
                      className="block text-sm font-medium text-heading mb-1"
                    >
                      What is this about?
                    </label>
                    <select
                      id="topic"
                      {...register("topic")}
                      className="w-full rounded-md border border-neutral/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {TOPICS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    {errors.topic && (
                      <p className="mt-1 text-sm text-alert">
                        {errors.topic.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="message"
                      className="block text-sm font-medium text-heading mb-1"
                    >
                      Message
                    </label>
                    <textarea
                      id="message"
                      rows={6}
                      placeholder="How can we help?"
                      {...register("message")}
                      className="w-full rounded-md border border-neutral/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {errors.message && (
                      <p className="mt-1 text-sm text-alert">
                        {errors.message.message}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="w-full rounded-md bg-primary text-white py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Send message
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
