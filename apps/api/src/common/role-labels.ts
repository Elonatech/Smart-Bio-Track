import type { UserRole } from '@prisma/client';

// Role names as people read them. The enum values (SUPER_ADMIN, HR_ADMIN…)
// are storage and API identifiers; any message a user can see uses these
// instead, so the screen never shows a raw constant. Plural because every
// sentence that names a role states a rule about everyone holding it.
// Keep in step with ROLE_LABEL in apps/web/src/lib/roleCreationMatrix.ts.
export const ROLE_LABEL_PLURAL: Record<UserRole, string> = {
  SUPER_ADMIN: 'Organization Owners',
  HR_ADMIN: 'HR Managers',
  TEAM_LEAD: 'Team Leads',
  EMPLOYEE: 'Employees',
};

// One person's role, for sentences about a single user — e.g. the audit
// entry "role HR Manager to Team Lead".
export const ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: 'Organization Owner',
  HR_ADMIN: 'HR Manager',
  TEAM_LEAD: 'Team Lead',
  EMPLOYEE: 'Employee',
};
