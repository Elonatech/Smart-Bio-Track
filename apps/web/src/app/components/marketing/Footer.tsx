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

export function Footer() {
  return (
    <footer className="border-t border-neutral/10 bg-surface">
      <div className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
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
              href="/contact"
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

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral">
              Contact
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-neutral">
              <li>14 Adeola Odeku Street, Victoria Island, Lagos</li>
              <li>+234 803 000 4412</li>
              <li>sales@elonatech.com.ng</li>
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
