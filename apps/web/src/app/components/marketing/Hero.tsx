import Link from "next/link";

export function Hero() {
  return (
    <section className="bg-background py-14 sm:py-16">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          Multi-signal verification, NDPA-aligned
        </span>
        <h1 className="mt-4 text-3xl font-semibold leading-tight text-heading sm:text-4xl">
          Attendance You Can Trust.
        </h1>
        <p className="mt-4 text-neutral">
          Staff clock in from their own phone. SmartBioTrack checks their
          fingerprint or face, the device they used, and exactly where they
          were standing — then scores every single punch out of 100, so
          buddy punching for a colleague is caught before it happens.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/auth/register"
            className="rounded-md bg-primary px-5 py-3 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            Start Free Trial →
          </Link>
          <Link
            href="/demo"
            className="rounded-md border border-neutral/30 px-5 py-3 text-sm font-medium text-heading hover:bg-neutral/10 transition-colors"
          >
            Book a Demo
          </Link>
        </div>
        <p className="mt-3 text-xs text-neutral">
          14-day free trial · No card required · Cancel anytime
        </p>

        {/* Stat row */}
        <div className="mt-10 grid grid-cols-3 gap-4 border-t border-neutral/10 pt-6">
          <div>
            <div className="text-2xl font-semibold text-heading">8</div>
            <div className="text-xs text-neutral">signals checked per punch</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-heading">&lt; 3s</div>
            <div className="text-xs text-neutral">average clock-in time</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-heading">0</div>
            <div className="text-xs text-neutral">biometric images stored</div>
          </div>
        </div>
      </div>
    </section>
  );
}
