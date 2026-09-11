"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

interface MobileNavProps {
  links: { href: string; label: string }[];
}


export function MobileNav({ links }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);


  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={isOpen ? "Close menu" : "Open menu"}
        aria-expanded={isOpen}
        aria-controls="mobile-nav-panel"
        className="text-heading md:hidden"
      >
        {isOpen ? (
          <X className="h-6 w-6" strokeWidth={1.75} />
        ) : (
          <Menu className="h-6 w-6" strokeWidth={1.75} />
        )}
      </button>

      {isOpen && (
        <>
          {/* Anchored with top-full against the sticky <header>, which is
              this fragment's nearest positioned ancestor. A hardcoded
              offset was 5px short of the real header height, so the panel
              tucked behind it and doubled up its bottom border.

              Starting below the header rather than at inset-0 also keeps
              the header visible and clickable, so the same button that
              opened the panel closes it instead of the overlay swallowing
              the tap. */}
          <div
            className="absolute inset-x-0 top-full z-40 h-screen bg-black/40 md:hidden"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          <div
            id="mobile-nav-panel"
            className="absolute inset-x-0 top-full z-50 max-h-[80vh] overflow-y-auto border-b border-neutral/10 bg-surface px-6 pb-6 pt-2 md:hidden"
          >
            <nav className="flex flex-col">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className="border-b border-neutral/10 py-3 text-base text-heading"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="mt-5 flex flex-col gap-3">
              <Link
                href="/auth/login"
                onClick={() => setIsOpen(false)}
                className="rounded-md border border-neutral/30 py-2.5 text-center text-sm font-medium text-heading"
              >
                Sign in
              </Link>
              <Link
                href="/auth/register"
                onClick={() => setIsOpen(false)}
                className="rounded-md bg-primary py-2.5 text-center text-sm font-medium text-white"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </>
      )}
    </>
  );
}
