import Link from "next/link";
import {
  Clock,
  Fingerprint,
  Globe,
  MapPin,
  ScanFace,
  ShieldCheck,
  Smartphone,
  Target,
  Users,
  Wifi,
} from "lucide-react";
import { Navbar } from "../components/marketing/Navbar";
import { Footer } from "../components/marketing/Footer";

export const metadata = {
  title: "About — SmartBioTrack",
  description:
    "Why Elonatech built SmartBioTrack: attendance records that survive scrutiny, from a Lagos-based team deploying workforce systems since 2014.",
};

const STATS = [
  { value: "2014", label: "Elonatech founded, Lagos" },
  { value: "3", label: "Cities served: Lagos, Abuja, PH" },
  { value: "8", label: "Signals per punch" },
  { value: "0", label: "Raw biometric images stored" },
];

// The eight signals are the product's actual substance, and they're the
// answer to "how would you prove this punch was real?" — the question
// this whole page exists to answer. Naming them here (matching
// PunchReviewModal exactly, so marketing and product don't drift) turns
// an abstract "we verify attendance" claim into something checkable.
const SIGNALS = [
  { icon: ShieldCheck, label: "User authentication", detail: "Session and MFA" },
  { icon: ScanFace, label: "Platform biometrics", detail: "Matched on-device" },
  { icon: Smartphone, label: "Registered device", detail: "Known handset" },
  { icon: Fingerprint, label: "Device attestation", detail: "Not rooted or faked" },
  { icon: MapPin, label: "Geo-fence", detail: "Inside the office radius" },
  { icon: Wifi, label: "Network context", detail: "Office gateway or not" },
  { icon: Target, label: "GPS accuracy", detail: "Within tolerance" },
  { icon: Clock, label: "Timestamp integrity", detail: "Replay protection" },
];

const PRINCIPLES = [
  {
    icon: ShieldCheck,
    title: "Verifiable, not assumed",
    body: "Every punch carries the evidence behind it. If a record cannot be explained, it should not be trusted.",
  },
  {
    icon: Users,
    title: "Respect for the workforce",
    body: "No raw biometric images leave the handset, and location is only read at the moment of a clock-in.",
  },
  {
    icon: Globe,
    title: "Built for how Nigeria works",
    body: "Landmark-aware addresses, patchy connectivity, multi-branch field teams and Naira-ready payroll exports.",
  },
  {
    icon: Clock,
    title: "Boring where it matters",
    body: "Audit logs, retention policies and exports that hold up when finance or a regulator asks questions.",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1">
        {/* ---- Hero ---- */}
        <section className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-16 py-16 lg:py-24">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral border-b border-neutral/30 inline-block pb-1">
            About us
          </p>
          <h1 className="mt-6 max-w-3xl text-4xl sm:text-5xl font-semibold text-heading leading-tight">
            We build attendance records that survive scrutiny
          </h1>
          <p className="mt-6 max-w-2xl text-neutral">
            SmartBioTrack is built by Elonatech Nigeria Limited, a Lagos-based
            technology services company that has spent years deploying
            infrastructure, security and workforce systems for banks,
            hospitals, manufacturers and multi-branch enterprises across the
            country.
          </p>
        </section>

        {/* ---- Story + mission ---- */}
        <section className="border-y border-neutral/10 bg-surface">
          <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-16 py-16 lg:py-20">
            <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
              <div>
                <h2 className="text-2xl font-semibold text-heading">
                  Why we built this
                </h2>
                <div className="mt-6 space-y-5 text-neutral">
                  <p>
                    On almost every deployment we ran into the same complaint:
                    nobody trusted the attendance register. Paper books were
                    signed in batches at the end of the week. Card readers were
                    tapped by colleagues. Fingerprint terminals broke, queued,
                    and quietly stopped being used.
                  </p>
                  <p>
                    Payroll teams were then asked to reconcile numbers they
                    could not defend. Managers argued over lateness. Field staff
                    who genuinely worked were penalised because there was no
                    proof.
                  </p>
                  <p>
                    So we stopped treating attendance as a single check and
                    started treating it as evidence. A punch is only accepted
                    when several independent signals agree, and every score is
                    reproducible from the audit log months later.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-neutral/20 bg-background p-6 sm:p-8 h-fit">
                <h3 className="text-base font-semibold text-heading">
                  Our mission
                </h3>
                <p className="mt-3 text-neutral">
                  To make workforce attendance in Africa accurate, private and
                  provable — so organizations pay for the work that actually
                  happened, and employees are credited for every hour they put
                  in.
                </p>

                <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-neutral/20 pt-8">
                  {STATS.map((stat) => (
                    <div key={stat.label}>
                      {/* The "0" is the most important number here — it's
                          the privacy claim, and it's the one a security
                          lead will ask about first. Same weight as the
                          rest so it reads as fact, not boast. */}
                      <dt className="text-3xl font-semibold text-heading tabular-nums">
                        {stat.value}
                      </dt>
                      <dd className="mt-1 text-[13px] text-neutral">
                        {stat.label}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </section>

        {/* ---- The eight signals ----
            Not in the reference design, which jumps from "several
            independent signals agree" straight to a values list. Naming
            them is what makes the claim believable, and it's the page's
            only concrete look at the product. */}
        <section className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-16 py-16 lg:py-20">
          <h2 className="text-2xl font-semibold text-heading">
            Eight signals, one score
          </h2>
          <p className="mt-3 max-w-2xl text-neutral">
            No single signal can approve a punch on its own — not even
            biometrics. They combine into a Trust Score out of 100, and anything
            borderline goes to a human for review rather than being silently
            accepted.
          </p>

          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SIGNALS.map(({ icon: Icon, label, detail }) => (
              <li
                key={label}
                className="rounded-xl border border-neutral/20 bg-surface p-5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <p className="mt-4 text-sm font-semibold text-heading">
                  {label}
                </p>
                <p className="mt-1 text-[13px] text-neutral">{detail}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- Principles ---- */}
        <section className="border-t border-neutral/10 bg-surface">
          <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-16 py-16 lg:py-20">
            <h2 className="text-2xl font-semibold text-heading">
              What we hold to
            </h2>

            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              {PRINCIPLES.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-xl border border-neutral/20 bg-background p-6"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-heading">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm text-neutral">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- CTA ---- */}
        <section className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-16 py-16">
          <div className="flex flex-col gap-6 rounded-2xl border border-neutral/20 bg-surface p-6 sm:p-8 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-heading">
                Want to talk it through?
              </h2>
              <p className="mt-2 text-sm text-neutral">
                Our team in Victoria Island is happy to walk you through a live
                evaluation.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 shrink-0">
              <Link
                href="/contact"
                className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
              >
                Contact us
              </Link>
              <Link
                href="/demo"
                className="rounded-md border border-neutral/30 px-5 py-2.5 text-sm font-medium text-heading hover:bg-neutral/10 transition-colors"
              >
                Book a demo
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
