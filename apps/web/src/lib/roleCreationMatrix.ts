import type { UserRole } from "@/lib/store/auth-store";

// Mirrors apps/api/src/users/users.service.ts's ROLE_CREATION_MATRIX
// exactly. The backend enforces this for real (a request the UI
// shouldn't even offer would still get a 403) — this copy exists only
// so the invite form's role dropdown shows the RIGHT options up front,
// instead of showing all four and letting the backend reject the
// invalid ones after a failed submit.
export const ROLE_CREATION_MATRIX: Record<UserRole, UserRole[]> = {
  SUPER_ADMIN: ["SUPER_ADMIN", "HR_ADMIN", "TEAM_LEAD", "EMPLOYEE"],
  HR_ADMIN: ["TEAM_LEAD", "EMPLOYEE"],
  TEAM_LEAD: [],
  EMPLOYEE: [],
  PLATFORM_ADMIN: [],
};

export const ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: "Org Super Admin",
  HR_ADMIN: "HR Administrator",
  TEAM_LEAD: "Team Lead",
  EMPLOYEE: "Employee",
  PLATFORM_ADMIN: "Platform Admin",
};
