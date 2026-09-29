import Link from "next/link";
import { ShieldCheck } from "lucide-react";

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
const SOCIAL_LINKS = [
  { label: "LinkedIn", href: "https://www.linkedin.com/company/elonatech/" },
  { label: "X", href: "https://twitter.com/Elonatech" },
  { label: "YouTube", href: "https://www.youtube.com/@elonatech" },
];

export function Footer() {
  return (
    <footer className="border-t border-neutral/10 bg-surface">
      <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-16 py-14">
        {/* SIX columns of content — the brand block spans 2, then
            Product, Company, Legal and Contact. This was md:grid-cols-5,
            one short, so Contact overflowed onto a second row and ended
            up stranded below the rest of the footer. */}
        <div className="grid grid-cols-2 gap-10 md:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" strokeWidth={1.75} />
              <span className="text-base font-semibold text-heading">
                SmartBioTrack
              </span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-neutral">
              Intelligent biometric & geo-fenced attendance management, by
              Elonatech Nigeria Limited.
            </p>
            <Link
              href="/demo"
              className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            >
              Request a Demo
            </Link>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <div key={column.heading}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral">
                {column.heading}
              </h3>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-neutral hover:text-heading transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Full width on phones (the grid is 2 columns there), one
              column from md up. A half-width column can't fit
              "sales@elonatech.com.ng" on one line, and an email has no
              spaces to wrap at — so it was breaking mid-word and
              orphaning the last letters onto their own line. */}
          <div className="col-span-2 md:col-span-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral">
              Contact
            </h3>
            {/* The phone and email are actionable — tel: and mailto: mean
                one tap to call or write on a phone, instead of copying
                text out of a footer. */}
            <ul className="mt-3 space-y-2 text-sm text-neutral">
              <li>14 Adeola Odeku Street, Victoria Island, Lagos</li>
              <li>
                <a
                  href="tel:+2348030004412"
                  className="hover:text-heading transition-colors"
                >
                  +234 803 000 4412
                </a>
              </li>
              <li>
                {/* No break-words: it splits an address at whatever
                    character happens to overflow. The column is now wide
                    enough to hold it, so it stays on one line. */}
                <a
                  href="mailto:sales@elonatech.com.ng"
                  className="hover:text-heading transition-colors"
                >
                  sales@elonatech.com.ng
                </a>
              </li>
            </ul>

            {/* target/rel on every external link — without rel the new
                tab can reach back at window.opener. */}
            <ul className="mt-4 flex flex-wrap gap-4 text-sm text-neutral">
              {SOCIAL_LINKS.map((social) => (
                <li key={social.label}>
                  <a
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-heading transition-colors"
                  >
                    {social.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-neutral/10 pt-6 text-center text-xs text-neutral">
          © 2026 Elonatech Nigeria Limited. All rights reserved. All times
          shown in West Africa Time (WAT).
        </div>
      </div>
    </footer>
  );
}
