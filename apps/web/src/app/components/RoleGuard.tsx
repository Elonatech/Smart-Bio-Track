"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store/auth-store";
import { getDashboardPath, roleForDashboardPath } from "@/lib/roleRoutes";

/**
 * Keeps each role inside its own area of the dashboard (#28).
 *
 * Until 24 Sep 2026 nothing in the browser checked this. `AuthGuard` asks
 * whether you are signed in; `proxy.ts` protects `/dashboard` as a single
 * prefix; no page read `user.role` at all. The only thing keeping an EMPLOYEE
 * off `/dashboard/super-admin/audit-logs` was that the sidebar did not draw
 * the link — type the URL and the page rendered, headings, buttons and all.
 *
 * ## What this is, and what it is emphatically not
 *
 * **It is not access control.** No data was ever exposed by its absence: the
 * API checks the role on every request and scopes each query to the caller's
 * organization and department. Those admin screens rendered *empty*. This
 * component does not protect data and must never be described as though it
 * does — if it is ever the only thing standing between a user and something,
 * that something is already wrong.
 *
 * **It is the layer that says "not for you".** Three reasons it earns its
 * place, in increasing order of seriousness:
 *
 *  1. An empty admin screen reads as *broken*, not as private, and generates
 *     a support ticket rather than an understanding.
 *  2. It advertises which screens exist and what they are called to people who
 *     will never be allowed to open them.
 *  3. Without it there is no default. Every screen built later that renders
 *     anything before its fetch resolves — a cached count, a name from the
 *     store, a heading — exposes that to the wrong role automatically. The
 *     absence was the finding; no single page was the bug.
 *
 * ## Why it redirects rather than renders a refusal
 *
 * A "you do not have access" screen would be the obvious thing and is the
 * wrong one here. Every route this guard sees is one the visitor reached
 * either from a stale bookmark or by editing the address bar, and in both
 * cases the useful outcome is their own dashboard, not a dead end. It also
 * keeps the guard from becoming a second place where a signed-in person can
 * get stuck, which is what #16 was.
 *
 * It renders `null` while redirecting, never the children. Rendering them for
 * even one frame is the flash this exists to prevent.
 */
export function RoleGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const role = useAuthStore((state) => state.user?.role);

  // Null for `/dashboard` itself and for any path that is not a role area.
  // Neither is a mismatch — see roleForDashboardPath.
  const areaRole = roleForDashboardPath(pathname ?? "");

  // `role` is undefined only in the window before the session is restored.
  // This component renders inside AuthGuard, which does not render children
  // until `hasRestored` is true, so in practice it is set — but the guard
  // must not decide anything on a role it does not know yet, because the
  // decision would be "redirect to somebody else's dashboard".
  const isMismatch = Boolean(role && areaRole && areaRole !== role);

  useEffect(() => {
    if (!isMismatch || !role) return;
    // `replace`, not `push`: the page they could not have is not somewhere the
    // back button should return them to.
    router.replace(getDashboardPath(role));
  }, [isMismatch, role, router]);

  if (isMismatch) return null;

  return <>{children}</>;
}
