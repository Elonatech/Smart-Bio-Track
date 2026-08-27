// Which department the signed-in Team Lead runs.
//
// Hardcoded for now because there's no way to ask: GET /auth/me returns
// { id, name, email, role, organizationId, organizationName } and NOT
// departmentId (see apps/api/src/auth/jwt/jwt.strategy.ts), and
// GET /users — which does return departmentId — is restricted to
// SUPER_ADMIN / HR_ADMIN / TEAM_LEAD... but gives the whole org, with no
// way to identify which row is you.
//
// Every Team Lead page that needs its own scope reads this one constant,
// so when /auth/me starts returning departmentId there's a single place
// to replace. A real API would scope by the caller's own department
// server-side rather than having the browser filter.
export const TEAM_DEPARTMENT = "Engineering";
