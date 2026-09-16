"use client";

import { Menu } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth-store";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { usePageHeaderContext } from "./PageHeaderContext";
import { NotificationPanel } from "./NotificationPanel";

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Org Super Admin",
  HR_ADMIN: "HR Administrator",
  TEAM_LEAD: "Team Lead",
  EMPLOYEE: "Employee",
  PLATFORM_ADMIN: "Platform Admin",
};

function getInitials(nameOrEmail: string): string {
  const parts = nameOrEmail.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return nameOrEmail.slice(0, 2).toUpperCase();
}

interface DashboardNavbarProps {
  // Opens the sidebar drawer on mobile/tablet — undefined/no-op on
  // desktop where the sidebar is always visible via Sidebar's own
  // collapse toggle instead.
  onOpenMobileMenu: () => void;
}

export function DashboardNavbar({ onOpenMobileMenu }: DashboardNavbarProps) {
  const user = useAuthStore((state) => state.user);
  const { title, subtitle } = usePageHeaderContext();

  if (!user) return null;

  return (
    <header className="h-16 flex items-center justify-between gap-3 px-4 xl:px-9 border-b border-neutral/20 bg-surface">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open menu"
          className="lg:hidden rounded-md p-2 -ml-2 text-neutral hover:bg-neutral/10 shrink-0"
        >
          <Menu className="h-5 w-5" strokeWidth={1.75} />
        </button>
        {/* One step smaller on phones so a title like "Organization
            overview" fits instead of truncating to "Organization ove…".
            The subtitle still truncates — it carries the org name and a
            long date, and losing its tail costs nothing. */}
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-semibold text-heading truncate">
            {title}
          </h1>
          <p className="text-xs text-neutral truncate">{subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        <ThemeToggle />

        {/* Composed client-side from what already exists (stale invites,
            employees with no department, flagged punches) rather than
            waiting on a dedicated notifications model/endpoint — see
            lib/notifications.ts for what backs each role. */}
        <NotificationPanel />

        {/* Hidden on phones. It's the widest thing in the bar and it's
            purely informational — the sidebar drawer already shows who's
            signed in — so the page title gets the space instead. */}
        <div className="hidden sm:flex items-center gap-2 rounded-md p-1 border border-neutral/20">
          <span className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
            {getInitials(user.name ?? user.email)}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-heading truncate">
              {user.name ?? user.email}
            </p>
            <p className="text-xs text-neutral truncate">
              {ROLE_LABEL[user.role] ?? user.role}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
