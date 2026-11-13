"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth-store";
import { getDashboardPath } from "@/lib/roleRoutes";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { usePageHeaderContext } from "./PageHeaderContext";
import { NotificationPanel } from "./NotificationPanel";
import { UserAvatar } from "./UserAvatar";

// See the note in Sidebar.tsx: this was the same map written out a fourth time.
import { ROLE_LABEL } from "@/lib/roleCreationMatrix";

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
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open menu"
          className="lg:hidden rounded-md p-2 -ml-2 text-neutral hover:bg-neutral/10 shrink-0"
        >
          <Menu className="h-5 w-5" strokeWidth={1.75} />
        </button>
        
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-semibold text-heading truncate">
            {title}
          </h1>
          <p className="text-xs text-neutral truncate">{subtitle}</p>
        </div>
      </div>

      {/* gap-1 on phones: the notification drawer's hidden fixed panels
          still count as flex children here, so each gap is paid several
          times — at gap-2 that cost "Organization overview" its last
          few pixels once the avatar became visible on phones. */}
      <div className="flex items-center gap-1 sm:gap-4 shrink-0">
        <ThemeToggle />

        {/* Composed client-side from what already exists (stale invites,
            employees with no department, flagged punches) rather than
            waiting on a dedicated notifications model/endpoint — see
            lib/notifications.ts for what backs each role. */}
        <NotificationPanel />

        {/* Links to the profile page, where the picture is changed. On
            phones only the avatar shows — the name and role are the widest
            thing in the bar, so the page title gets that space instead. */}
        <Link
          href={`${getDashboardPath(user.role)}/profile`}
          aria-label="Your profile"
          className="flex items-center gap-2 rounded-md sm:p-1 sm:border border-neutral/20 hover:bg-neutral/10"
        >
          <UserAvatar userId={user.id} nameOrEmail={user.name ?? user.email} />
          <div className="hidden sm:block min-w-0">
            <p className="text-sm font-medium text-heading truncate">
              {user.name ?? user.email}
            </p>
            <p className="text-xs text-neutral truncate">
              {ROLE_LABEL[user.role] ?? user.role}
            </p>
          </div>
        </Link>
      </div>
    </header>
  );
}
