"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store/auth-store";
import { getDashboardPath } from "@/lib/roleRoutes";

// There's no generic "dashboard" screen — every role has its own. This
// bare /dashboard route only exists as a safety net for anyone landing
// here directly (e.g. an old bookmark), redirecting to whichever
// dashboard matches their actual role. If there's no session at all,
// falls back to Super Admin's — AuthGuard on that page will catch the
// missing session and show the sign-in prompt instead.
export default function DashboardIndexPage() {
  const router = useRouter();
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const role = useAuthStore((state) => state.user?.role);

  useEffect(() => {
    if (!isHydrated) return;
    router.replace(role ? getDashboardPath(role) : "/dashboard/super-admin");
  }, [isHydrated, role, router]);

  return null;
}
