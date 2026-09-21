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
