"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ShieldCheck, LogOut, PanelLeftClose, PanelLeftOpen, X, ChevronsRight, ChevronsLeft } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth-store";
import { useToast } from "@/app/components/Toast";
import type { SidebarItem } from "./sidebarConfig";

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Org Super Admin",
  HR_ADMIN: "HR Administrator",
  TEAM_LEAD: "Team Lead",
  EMPLOYEE: "Employee",
  PLATFORM_ADMIN: "Platform Admin",
};

interface SidebarProps {
  items: SidebarItem[];
  // Mobile/tablet: an off-canvas drawer, open/closed via the navbar's
  // hamburger button (below the lg breakpoint the aside is fixed +
  // translated off-screen rather than just hidden, so it can slide in).
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  // Desktop only (lg+): same sidebar, but width toggles between the
  // full 64 (icons+labels) and a 20 icon-only rail.
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({
  items = [],
  isMobileOpen,
  onCloseMobile,
  isCollapsed,
  onToggleCollapse,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const toast = useToast();

  function handleSignOut() {
    logout();
    toast.success("Signed out successfully");
    router.push("/auth/login");
  }

  return (
    <>
      {/* Backdrop — only rendered (and only clickable) while the mobile
          drawer is open; closes the drawer on tap, same as any
          standard off-canvas menu. */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden
        />
      )}

      <aside
        className={`
          bg-sidebar text-white flex flex-col shrink-0
          fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-200
          ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
          lg:static lg:translate-x-0 lg:transition-[width]
          ${isCollapsed ? "lg:w-20" : "lg:w-64"}
        `}
      >
        <div
          className={`flex items-center gap-2 h-16 shrink-0 ${
            isCollapsed ? "lg:justify-center lg:px-2" : "justify-between px-5"
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="h-5 w-5 shrink-0" strokeWidth={1.75} />
            {!isCollapsed && (
              <span className="font-semibold truncate">SmartBioTrack</span>
            )}
          </div>

          {/* Close button — mobile/tablet drawer only, sidebar never
              collapses there, only opens/closes as a drawer. */}
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close menu"
            className="lg:hidden text-white/70 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Collapse toggle — desktop only. Hidden alongside the brand
              text when collapsed (icon-only rail is too narrow for
              both), reappears once expanded. */}
          {!isCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Collapse sidebar"
              className="hidden lg:block text-white/70 hover:text-white"
            >
              <PanelLeftClose className="h-5 w-5" strokeWidth={1.75} />
            </button>
          )}
        </div>

        {/* When collapsed, the expand toggle takes the header's place
            entirely (centered, since there's no brand text to share
            the row with) — clicking the logo area would be
            unintuitive, so this is its own explicit control. */}
        {isCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Expand sidebar"
            className="hidden lg:flex items-center justify-center py-2 mx-3 mb-2 rounded-md text-white/70 hover:bg-white/5 hover:text-white"
          >
            <PanelLeftOpen className="h-5 w-5" strokeWidth={1.75} />
          </button>
        )}

        {user && !isCollapsed && (
          <div className="mx-4 mb-4 rounded-lg bg-white/5 px-3 py-2.5">
            <p className="text-[10px] font-medium tracking-wide uppercase text-white/50">
              {ROLE_LABEL[user.role] ?? user.role}
            </p>
            <p className="text-sm font-medium truncate">
              {user.organizationName ?? "Your organization"}
            </p>
          </div>
        )}

        {/* "Overview" is always items[0] and its href IS the role's
            root dashboard path (see sidebarConfig.ts) — every other
            item's href is a sub-route nested under that same root, so
            a plain startsWith prefix-check would make Overview match
            (and stay highlighted for) every other page too. Only that
            one root item requires an exact match; every other item
            still prefix-matches its own nested sub-routes. */}
        <nav className="flex-1 px-5 space-y-1.5 overflow-y-auto">
          {items.map(({ label, href, icon: Icon }) => {
            const rootHref = items[0]?.href;
            const isActive =
              pathname === href || (href !== rootHref && pathname.startsWith(`${href}/`));

            return (
              <Link
                key={href}
                href={href}
                onClick={onCloseMobile}
                title={isCollapsed ? label : undefined}
                className={`flex items-center gap-3 rounded-md px-4 py-2.5 text-sm font-medium
                  ${isCollapsed ? "lg:justify-center lg:px-0" : ""}
                  ${
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-white/70 hover:bg-white/5 hover:text-white"
                  }
                `}
              >
                <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                {!isCollapsed && label}
              </Link>
            );
          })}
        </nav>

        {!isCollapsed && (
          <div className="mx-4 mb-4 rounded-lg bg-white/5 px-3 py-2.5 text-xs text-white/60">
            Audit records are immutable and cannot be altered or deleted.
          </div>
        )}

        <button
          type="button"
          onClick={handleSignOut}
          title={isCollapsed ? "Sign out" : undefined}
          className={`flex items-center gap-3 px-3 py-2 mx-3 mb-2 rounded-md text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white ${
            isCollapsed ? "lg:justify-center" : ""
          }`}
        >
          <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          {!isCollapsed && "Sign out"}
        </button>
      </aside>
    </>
  );
}
