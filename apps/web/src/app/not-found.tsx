import Link from "next/link";
import { ArrowRight, Home, LifeBuoy, ShieldCheck } from "lucide-react";

const DESTINATIONS = [
  {
    href: "/",
    icon: Home,
    title: "Homepage",
    description: "Product overview, pricing and how verification works.",
  },
  {
    href: "/dashboard",
    icon: ShieldCheck,
    title: "Your dashboard",
    description: "Signed in? This takes you to the right one for your role.",
  },
  {
    href: "/contact",
    icon: LifeBuoy,
    title: "Contact support",
    description: "Tell us what you were looking for and we'll help.",
  },
];

export default function NotFound() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-5xl grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
        <div className="order-first lg:order-last">
          <OutsideTheFence />
        </div>

        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-heading mb-8"
          >
            <ShieldCheck className="h-6 w-6 text-primary" strokeWidth={1.75} />
            <span className="text-lg font-semibold">SmartBioTrack</span>
          </Link>

          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-neutral/20 bg-surface px-3 py-1 text-xs font-medium text-neutral">
              <span className="h-1.5 w-1.5 rounded-full bg-alert" />
              Error 404
            </p>
          </div>

          <h1 className="mt-5 text-3xl sm:text-4xl font-semibold text-heading">
            This page doesn&apos;t exist
          </h1>

          <p className="mt-4 text-neutral max-w-md">
            The link may be out of date, or the address might have a typo.
            Nothing has gone wrong with your account.
          </p>

          <div className="mt-8 space-y-3">
            {DESTINATIONS.map(({ href, icon: Icon, title, description }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-4 rounded-xl border border-neutral/20 bg-surface p-4 hover:border-primary/40 transition-colors"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-heading">
                    {title}
                  </span>
                  <span className="block text-[13px] text-neutral">
                    {description}
                  </span>
                </span>
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-neutral group-hover:text-primary transition-colors"
                  strokeWidth={1.75}
                />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function OutsideTheFence() {
  return (
    <div className="rounded-2xl border border-neutral/20 bg-surface p-4 sm:p-6">
      <svg
        viewBox="0 0 400 300"
        role="img"
        aria-label="A location pin sitting outside a geo-fence"
        className="w-full h-auto"
      >
        <defs>
          <pattern
            id="notfound-grid"
            width="28"
            height="28"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 28 0 L 0 0 0 28"
              fill="none"
              strokeWidth="1"
              className="stroke-neutral/15"
            />
          </pattern>
        </defs>

        <rect width="400" height="300" fill="url(#notfound-grid)" rx="12" />

        <circle 
          cx="160"
          cy="160"
          r="88"
          strokeWidth="2"
          strokeDasharray="7 6"
          className="fill-primary/10 stroke-primary/60"
        />
        <circle cx="160" cy="160" r="4" className="fill-primary" />
        <text
          x="160"
          y="186"
          textAnchor="middle"
          className="fill-neutral text-[11px]"
        >
          Known pages
        </text>

        {/* The request: outside it, and clearly so. */}
        <line
          x1="243"
          y1="140"
          x2="312"
          y2="96"
          strokeWidth="2"
          strokeDasharray="5 5"
          className="stroke-alert/40"
        />
        <circle cx="322" cy="90" r="22" className="fill-alert/10" />
        <circle
          cx="322"
          cy="90"
          r="9"
          strokeWidth="3"
          className="fill-alert stroke-surface"
        />
        <text
          x="322"
          y="134"
          textAnchor="middle"
          className="fill-neutral text-[11px]"
        >
          You are here
        </text>
      </svg>
    </div>
  );
}
