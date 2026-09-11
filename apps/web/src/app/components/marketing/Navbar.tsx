import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { MobileNav } from "./MobileNav";

const NAV_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-neutral/10 bg-surface/80 backdrop-blur">
      {/* Logo left, everything else in one right-hand group.
          Previously this row was `justify-between` over FOUR children —
          logo, nav, actions, theme toggle — so the browser spread all four
          evenly and the nav links floated in the middle of the bar,
          detached from the buttons they belong beside. The group below is
          pushed right by `ml-auto` instead, which keeps the links and
          actions reading as one cluster at any width. */}
      <div className="mx-auto flex max-w-7xl items-center px-6 sm:px-10 lg:px-16 py-4 sm:py-3">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <ShieldCheck
            className="h-5 w-5 shrink-0 text-primary"
            strokeWidth={1.75}
          />
          <span className="truncate text-base font-semibold text-heading">
            SmartBioTrack
          </span>
        </Link>

        <div className="ml-auto flex shrink-0 items-center gap-4 sm:gap-6 lg:gap-8">
          <nav className="hidden items-center gap-6 lg:gap-8 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-neutral hover:text-heading transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-4 md:flex">
            <Link
              href="/auth/login"
              className="text-sm font-medium text-heading"
            >
              Sign in
            </Link>
            <Link
              href="/auth/register"
              className="whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            >
              Start Free Trial
            </Link>
          </div>


          <div className="flex items-center gap-4 md:border-l md:border-neutral/20 md:pl-4">
            <ThemeToggle />
            <MobileNav links={NAV_LINKS} />
          </div>
        </div>
      </div>
    </header>
  );
}
