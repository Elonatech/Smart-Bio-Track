import { USER_ROLES, type UserRole } from '@smartbiotrack/types';
import {
  ROLE_BY_DASHBOARD_SEGMENT,
  ROLE_DASHBOARD_PATH,
  getDashboardPath,
  roleForDashboardPath,
} from './roleRoutes';
import { ROLE_CREATION_MATRIX, ROLE_LABEL } from './roleCreationMatrix';

/**
 * The browser's three role maps, checked against the shared enum.
 *
 * `Record<UserRole, …>` already makes a missing role a compile error, which is
 * most of the protection and the point of #25. These tests cover what the type
 * cannot:
 *
 *  * that every value is *sensible*, not merely present — a `Record` is equally
 *    happy with an empty string;
 *  * that `getDashboardPath` returns something for every role that exists,
 *    which is what stops a newly added role redirecting to `undefined`.
 *
 * Cheap, and they fail loudly the day somebody adds a role to the Prisma schema
 * and updates `packages/types` without touching the browser.
 */
describe('role maps', () => {
  it.each(USER_ROLES)('gives %s a dashboard path', (role) => {
    const path = getDashboardPath(role);

    expect(path).toMatch(/^\/dashboard\//);
  });

  it.each(USER_ROLES)('gives %s a human-readable label', (role) => {
    expect(ROLE_LABEL[role].trim().length).toBeGreaterThan(0);
    // The label is what an admin reads in the staff list. A raw enum name
    // leaking through means somebody added a role and skipped this map.
    expect(ROLE_LABEL[role]).not.toBe(role);
  });

  it('routes each role somewhere distinct, except where that is deliberate', () => {
    const paths = USER_ROLES.map((role) => ROLE_DASHBOARD_PATH[role]);

    expect(new Set(paths).size).toBe(USER_ROLES.length);
  });

  describe('who may create whom', () => {
    it('never lets a role create one it has no entry for', () => {
      for (const role of USER_ROLES) {
        for (const creatable of ROLE_CREATION_MATRIX[role]) {
          expect(USER_ROLES).toContain(creatable);
        }
      }
    });

    // The browser copy exists only so the invite form offers the right options.
    // The API enforces this for real — a request the UI would never offer still
    // gets a 403 — so a drift here is a confusing form, not a privilege
    // escalation. Worth pinning anyway: the confusing form is what a customer
    // reports.
    it('keeps SUPER_ADMIN as the only role that can create its own kind', () => {
      const selfCreating = USER_ROLES.filter((role: UserRole) =>
        ROLE_CREATION_MATRIX[role].includes(role),
      );

      expect(selfCreating).toEqual(['SUPER_ADMIN']);
    });

    it('gives the two non-administrative roles no creation rights at all', () => {
      expect(ROLE_CREATION_MATRIX.TEAM_LEAD).toEqual([]);
      expect(ROLE_CREATION_MATRIX.EMPLOYEE).toEqual([]);
    });
  });
});

/**
 * The reverse map, added with #28's RoleGuard.
 *
 * It is derived from ROLE_DASHBOARD_PATH rather than written out, so these
 * tests are really about the derivation holding — a segment map that drifts
 * from the paths fails *open*, matching nothing and letting every role
 * through.
 */
describe('roleForDashboardPath', () => {
  it.each(USER_ROLES)('maps the %s dashboard path back to it', (role) => {
    expect(roleForDashboardPath(ROLE_DASHBOARD_PATH[role])).toBe(role);
  });

  it.each(USER_ROLES)('maps a nested page under %s back to it', (role) => {
    expect(roleForDashboardPath(`${ROLE_DASHBOARD_PATH[role]}/profile/edit`)).toBe(role);
  });

  it('has exactly one segment per role, with none collapsed', () => {
    // Two roles resolving to the same segment would make the guard let one of
    // them into the other's area, silently.
    expect(Object.keys(ROLE_BY_DASHBOARD_SEGMENT)).toHaveLength(USER_ROLES.length);
  });

  it('returns null for /dashboard itself', () => {
    expect(roleForDashboardPath('/dashboard')).toBeNull();
  });

  it('returns null for an unknown area, rather than guessing', () => {
    expect(roleForDashboardPath('/dashboard/reports')).toBeNull();
  });

  it('returns null outside the dashboard entirely', () => {
    expect(roleForDashboardPath('/auth/login')).toBeNull();
    expect(roleForDashboardPath('/')).toBeNull();
  });

  it('is not fooled by a path that merely contains a role segment', () => {
    // /marketing/super-admin is not the Super Admin area. A guard matching on
    // `includes` would treat it as one.
    expect(roleForDashboardPath('/marketing/super-admin')).toBeNull();
  });
});
