"use client";

import { useState } from "react";
import { useToast } from "@/app/components/Toast";

const SALES_EMAIL = "sales@elonatech.com.ng";

export function Newsletter() {
  const toast = useToast();
  const [email, setEmail] = useState("");

  // No newsletter backend exists yet, so this drafts a mailto — same
  // fallback the Contact and Demo forms use — rather than silently
  // pretending the email was captured somewhere.
  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent("Newsletter subscription request");
    const body = encodeURIComponent(
      `Please subscribe this email address to the SmartBioTrack newsletter:\n\n${email}`
    );
    window.location.href = `mailto:${SALES_EMAIL}?subject=${subject}&body=${body}`;
    toast.success(
      "Almost done!",
      "Press send in your email app to confirm your subscription."
    );
    setEmail("");
  };

  return (
    <section className="bg-primary py-16 text-white">
      <div className="mx-auto max-w-4xl px-6 sm:px-10 lg:px-16 text-center">
        <h2 className="text-2xl sm:text-3xl font-semibold">
          Subscribe to our newsletter
        </h2>
        <p className="mt-3 text-white/80 max-w-xl mx-auto">
          Product updates and attendance management tips, straight to your
          inbox.
        </p>
        <form
          onSubmit={handleSubscribe}
          className="mt-6 flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email*"
            className="w-full rounded-md border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white"
          />
          <button
            type="submit"
            className="whitespace-nowrap rounded-md bg-alert px-5 py-2.5 text-sm font-medium text-white hover:bg-alert/90 transition-colors"
          >
            Subscribe
          </button>
        </form>
      </div>
    </section>
  );
}
