import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import {
  FaFacebookF,
  FaInstagram,
  FaLinkedinIn,
  FaXTwitter,
  FaYoutube,
} from "react-icons/fa6";

const FOOTER_COLUMNS = [
  {
    heading: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#trust", label: "Trust & Security" },
      { href: "/#pricing", label: "Pricing" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About Us" },
      { href: "/contact", label: "Contact" },
      // Its own page, not /contact — a demo request is a qualified sales
      // lead needing company, size and phone, which a general contact
      // form shouldn't ask everyone for.
      { href: "/demo", label: "Book a Demo" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Service" },
    ],
  },
];

// Elonatech's real profiles. Note X is on the twitter.com domain, not
// x.com — that's the URL they gave, and twitter.com still redirects, so
// it's left exactly as supplied rather than "modernised" into a guess.
//
// Facebook and Instagram were NOT supplied — those two follow the same
// "elonatech" handle as the others and need confirming against the real
// profiles before this ships.
//
// Icons come from react-icons rather than lucide-react: lucide dropped
// all brand logos in v1 (its `X` export is a close-button cross, not the
// X logo).
const SOCIAL_LINKS = [
  { label: "Facebook", href: "https://www.facebook.com/elonatech", Icon: FaFacebookF },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/elonatech/", Icon: FaLinkedinIn },
  { label: "X (Twitter)", href: "https://twitter.com/Elonatech", Icon: FaXTwitter },
  { label: "Instagram", href: "https://www.instagram.com/elonatech", Icon: FaInstagram },
  { label: "YouTube", href: "https://www.youtube.com/@elonatech", Icon: FaYoutube },
];

export function Footer() {
  return (
    <footer className="border-t border-neutral/10 bg-black text-white dark:bg-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-16 py-14">
        {/* Explicit fr widths at lg instead of six equal columns: the
            Contact column holds five social icons plus a street address,
            and an equal sixth of the width (~160px) wrapped the fifth icon
            onto its own row. */}
        <div className="grid grid-cols-2 gap-10 md:grid-cols-3 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1.5fr]">
          <div className="col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" strokeWidth={1.75} />
              <span className="text-base font-semibold text-white">
                SmartBioTrack
              </span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-white/70">
              Intelligent biometric & geo-fenced attendance management, by
              Elonatech Nigeria Limited.
            </p>
            <Link
              href="/demo"
              className="mt-4 inline-block rounded-md bg-alert px-4 py-2 text-sm font-medium text-white hover:bg-alert/90 transition-colors"
            >
              Request a Demo
            </Link>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <div key={column.heading}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-white/60">
                {column.heading}
              </h3>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/80 hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="col-span-2 md:col-span-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-white/60">
              Contact
            </h3>
            {/* The phone and email are actionable — tel: and mailto: mean
                one tap to call or write on a phone, instead of copying
                text out of a footer. */}
            <ul className="mt-3 space-y-2 text-sm text-white/80">
              <li>14 Adeola Odeku Street, Victoria Island, Lagos</li>
              <li>
                <a
                  href="tel:+2348030004412"
                  className="hover:text-white transition-colors"
                >
                  +234 803 000 4412
                </a>
              </li>
              <li>
                <a
                  href="mailto:sales@elonatech.com.ng"
                  className="hover:text-white transition-colors"
                >
                  sales@elonatech.com.ng
                </a>
              </li>
            </ul>

            {/* target/rel on every external link — without rel the new
                tab can reach back at window.opener. */}
            {/* Icon-only, so the accessible name has to come from
                aria-label — a screen reader would otherwise announce an
                unnamed link. The glyph itself is decorative. */}
            {/* Sized so all five fit one row in the Contact column, which
                is only ~190px wide at lg — five 36px circles wrapped onto
                three rows. */}
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {SOCIAL_LINKS.map(({ label, href, Icon }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    title={label}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/80 hover:border-white hover:text-white transition-colors"
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-16 py-6 text-center text-xs text-white/60">
          © 2026 Elonatech Nigeria Limited. All rights reserved. All times
          shown in West Africa Time (WAT).
        </div>
      </div>
    </footer>
  );
}
