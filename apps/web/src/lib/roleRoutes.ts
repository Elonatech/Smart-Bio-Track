import type { UserRole } from "@/lib/store/auth-store";

export const ROLE_DASHBOARD_PATH: Record<UserRole, string> = {
  SUPER_ADMIN: "/dashboard/super-admin",
  HR_ADMIN: "/dashboard/hr-admin",
  TEAM_LEAD: "/dashboard/team-lead",
  EMPLOYEE: "/dashboard/employee",
};

export function getDashboardPath(role: UserRole): string {
  return ROLE_DASHBOARD_PATH[role];
}

/**
 * The URL segment that identifies each role's area, derived from the paths
 * above rather than written out again.
 *
 * Deriving it is the whole point. A second hand-typed map from "super-admin"
 * to SUPER_ADMIN would be a copy that nothing checks — rename a route and the
 * guard that depends on this would go on matching the old segment, which
 * fails *open*: the mismatch stops being detected and every role reaches the
 * page again. That is #25's lesson applied to routing.
 */
export const ROLE_BY_DASHBOARD_SEGMENT: Readonly<Record<string, UserRole>> =
  Object.freeze(
    Object.fromEntries(
      (Object.entries(ROLE_DASHBOARD_PATH) as [UserRole, string][]).map(
        ([role, path]) => [path.split("/")[2], role]
      )
    )
  );

/**
 * Which role's area a pathname belongs to, or null if it is not inside one.
 *
 * Null covers two genuinely different cases and treats them the same on
 * purpose, because neither is a role mismatch:
 *
 *  - `/dashboard` itself, which has no role segment. Its page redirects to
 *    whichever dashboard matches the session.
 *  - `/dashboard/something-else`, which is not a role area at all. Next's own
 *    404 should handle that; a guard inventing a redirect would hide the
 *    broken link from whoever made it.
 */
export function roleForDashboardPath(pathname: string): UserRole | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "dashboard") return null;
  return ROLE_BY_DASHBOARD_SEGMENT[segments[1] ?? ""] ?? null;
}
