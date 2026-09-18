import { UserRole, UserStatus } from '@prisma/client';
import {
  USER_ROLES,
  USER_STATUSES,
  isUserRole,
  isUserStatus,
  type UserRole as SharedUserRole,
  type UserStatus as SharedUserStatus,
} from '@smartbiotrack/types';

/**
 * Holds `packages/types` to what Prisma actually generates.
 *
 * `packages/types` exists so the browser stops hand-copying the enums, but a
 * hand-written copy that nothing verifies is simply an eighth copy in a tidier
 * folder. This file is what makes it a source of truth rather than a promise.
 *
 * Both halves matter, and they fail differently:
 *
 *  * The **type-level** assertions below fail the *typecheck* — `tsc --noEmit`
 *    goes red, and so does the build. They catch drift even if nobody runs the
 *    tests, which is the case that actually happens.
 *  * The **runtime** assertions catch what types cannot: `Object.keys` on the
 *    generated Prisma enum object is the real list at runtime, so a value
 *    present in the schema but missing here is caught by name, in a message
 *    that says which one.
 *
 * Checked in **both directions** on purpose. A one-way check ("every shared
 * value is a real one") passes happily while the schema grows a role nobody
 * told the frontend about — which is precisely how `DELETED` went missing from
 * the browser's `UserStatus` for a fortnight.
 */

// ---------------------------------------------------------------------------
// Compile-time. These produce no output; they exist to fail `tsc`.
// ---------------------------------------------------------------------------

/** Compiles only if T and U are the same type, in both directions. */
type Exact<T, U> = [T] extends [U] ? ([U] extends [T] ? true : never) : never;

// If either assignment errors, `packages/types` and the Prisma schema have
// diverged. Fix packages/types — the schema is the source, never the other way.
const _rolesMatch: Exact<SharedUserRole, UserRole> = true;
const _statusesMatch: Exact<SharedUserStatus, UserStatus> = true;

// Referenced so `noUnusedLocals` cannot quietly delete the assertions above.
void _rolesMatch;
void _statusesMatch;

// ---------------------------------------------------------------------------
// Runtime.
// ---------------------------------------------------------------------------

describe('shared enums match Prisma', () => {
  it('UserRole has exactly the values Prisma generates', () => {
    expect([...USER_ROLES].sort()).toEqual(Object.keys(UserRole).sort());
  });

  it('UserStatus has exactly the values Prisma generates', () => {
    expect([...USER_STATUSES].sort()).toEqual(Object.keys(UserStatus).sort());
  });

  // The specific drift this finding was raised for. Named explicitly so that
  // if PLATFORM_ADMIN is ever reintroduced, it is reintroduced deliberately —
  // starting in the Prisma schema, where a role that no organization owns has
  // to answer for every org-scoped query before it can exist.
  it('has no PLATFORM_ADMIN role', () => {
    expect(USER_ROLES).not.toContain('PLATFORM_ADMIN');
    expect(Object.keys(UserRole)).not.toContain('PLATFORM_ADMIN');
  });

  // DELETED is easy to drop from a display type, and dropping it is how a
  // soft-deleted user renders as a blank status badge instead of an error.
  it('includes DELETED, which soft deletes added', () => {
    expect(USER_STATUSES).toContain('DELETED');
  });

  describe('guards', () => {
    it('accepts real values', () => {
      expect(isUserRole('HR_ADMIN')).toBe(true);
      expect(isUserStatus('SUSPENDED')).toBe(true);
    });

    it('rejects anything else, including the role that never existed', () => {
      expect(isUserRole('PLATFORM_ADMIN')).toBe(false);
      expect(isUserRole('hr_admin')).toBe(false);
      expect(isUserRole(undefined)).toBe(false);
      expect(isUserStatus('')).toBe(false);
    });
  });
});
