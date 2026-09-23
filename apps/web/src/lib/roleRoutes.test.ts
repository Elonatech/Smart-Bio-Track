import { USER_ROLES, type UserRole } from '@smartbiotrack/types';
import { ROLE_DASHBOARD_PATH, getDashboardPath } from './roleRoutes';
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
