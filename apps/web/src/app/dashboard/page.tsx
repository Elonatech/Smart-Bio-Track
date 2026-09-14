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
  // Waits for the session restore to finish before routing. Redirecting while
  // it is still in flight would send every signed-in user to the Super Admin
  // fallback, because `role` is not known yet.
  const hasRestored = useAuthStore((state) => state.hasRestored);
  const role = useAuthStore((state) => state.user?.role);

  useEffect(() => {
    if (!hasRestored) return;
    router.replace(role ? getDashboardPath(role) : "/dashboard/super-admin");
  }, [hasRestored, role, router]);

  return null;
}
