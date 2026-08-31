"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/app/components/AuthGuard";
import { Sidebar } from "@/app/components/dashboard/Sidebar";
import { DashboardNavbar } from "@/app/components/dashboard/DashboardNavbar";
import { SIDEBAR_ITEMS } from "@/app/components/dashboard/sidebarConfig";
import { PageHeaderProvider } from "@/app/components/dashboard/PageHeaderContext";
import { useAuthStore } from "@/lib/store/auth-store";

const COLLAPSED_STORAGE_KEY = "dashboard-sidebar-collapsed";

// Every route under /dashboard/* shares this shell — sidebar (items
// vary by role, see sidebarConfig.ts) + topbar + the page's own
// content. AuthGuard wraps the whole shell, not just the content area,
// so an unauthenticated visitor sees only the sign-in prompt, never a
// flash of sidebar/navbar around nothing.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = useAuthStore((state) => state.user?.role);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Desktop icons-only collapse — persisted so it survives a refresh,
  // same as the theme toggle does with localStorage.
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    setIsCollapsed(localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true");
  }, []);

  function toggleCollapse() {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  }

  return (
    <AuthGuard>
      {/* Wraps navbar + content: the navbar reads the current title/
          subtitle, and each page sets them via usePageHeader — both
          need to be inside the same provider. */}
      <PageHeaderProvider>
        <div className="flex h-screen">
          {/* role is undefined for the instant before AuthGuard's own
              isAuthenticated check resolves, and SIDEBAR_ITEMS[role]
              can itself be undefined if role somehow doesn't match a
              known key (e.g. hand-edited localStorage during dev) —
              `?? []` in both cases falls back to an empty sidebar
              rather than crashing on a missing lookup. */}
          <Sidebar
            items={(role && SIDEBAR_ITEMS[role]) ?? []}
            isMobileOpen={isMobileOpen}
            onCloseMobile={() => setIsMobileOpen(false)}
            isCollapsed={isCollapsed}
            onToggleCollapse={toggleCollapse}
          />
          <div className="flex-1 flex flex-col min-w-0">
            <DashboardNavbar onOpenMobileMenu={() => setIsMobileOpen(true)} />
            <main className="flex-1 overflow-y-auto bg-background px-6 xl:px-10 sm:pt-6 pt-4">
              {children}
            </main>
          </div>
        </div>
      </PageHeaderProvider>
    </AuthGuard>
  );
}
