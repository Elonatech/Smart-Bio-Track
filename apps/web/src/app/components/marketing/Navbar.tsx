import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/app/components/ThemeToggle";

const NAV_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-neutral/10 bg-surface/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" strokeWidth={1.75} />
          <span className="text-base font-semibold text-heading">
            SmartBioTrack
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
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

        <div className="flex items-center gap-3">
          <Link
            href="/auth/login"
            className="hidden text-sm font-medium text-heading sm:block"
          >
            Sign in
          </Link>
          <Link
            href="/auth/register"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            Start Free Trial
          </Link>
        </div>

        <div className="">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
