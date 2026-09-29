"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";

interface PageHeader {
  title: string;
  subtitle: string;
}

interface PageHeaderContextValue extends PageHeader {
  setPageHeader: (header: PageHeader) => void;
}

const PageHeaderContext = createContext<PageHeaderContextValue | null>(null);

// Wraps every /dashboard/* route in dashboard/layout.tsx. Replaces the
// old static PAGE_TITLES lookup (pathname -> fixed string), which
// couldn't express a subtitle built from live data like "2 locations"
// — each page now sets its own title/subtitle directly via
// usePageHeader below, and DashboardNavbar just reads whatever the
// current page last set.
export function PageHeaderProvider({ children }: { children: React.ReactNode }) {
  const [header, setHeader] = useState<PageHeader>({ title: "Dashboard", subtitle: "" });

  const setPageHeader = useCallback((next: PageHeader) => setHeader(next), []);

  return (
    <PageHeaderContext.Provider value={{ ...header, setPageHeader }}>
      {children}
    </PageHeaderContext.Provider>
  );
}

export function usePageHeaderContext() {
  const ctx = useContext(PageHeaderContext);
  if (!ctx) {
    throw new Error("usePageHeaderContext must be used within PageHeaderProvider");
  }
  return ctx;
}

export function usePageHeader(title: string, subtitle: string) {
  const { setPageHeader } = usePageHeaderContext();
  useEffect(() => {
    setPageHeader({ title, subtitle });
  }, [title, subtitle, setPageHeader]);
}
