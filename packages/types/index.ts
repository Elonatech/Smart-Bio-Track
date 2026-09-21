/**
 * The one definition of the enums both sides share.
 *
 * Before this file existed, `UserRole` and `UserStatus` were written out by
 * hand in seven places across `apps/web`, kept in step by memory alone. They
 * had already drifted in both directions:
 *
 *  * The frontend declared a fifth role, `PLATFORM_ADMIN`, that the Prisma enum
 *    has never had — so no user could ever hold it, and every branch written
 *    for it was unreachable. It had a nav menu, a route and a role-matrix entry
 *    regardless.
 *  * `UserStatus` never gained `DELETED` when soft deletes landed, so the two
 *    places that narrowed a user's status to `PENDING | ACTIVE | SUSPENDED`
 *    were quietly lying. Harmless only because `findAll` filters deleted users
 *    out before they reach the browser — nothing structural about it.
 *
 * ## Why plain string unions and not Prisma's own types
 *
 * `@prisma/client` is a server dependency: it carries the query engine and a
 * generated client that has no business being resolvable from browser code.
 * Importing its enums into `apps/web` to save duplication would trade a typo
 * risk for a bundling one.
 *
 * So this package restates them — and `apps/api/src/common/shared-enums.spec.ts`
 * asserts, at compile time and in both directions, that what is written here is
 * exactly what Prisma generates. Add a role to the schema and forget this file,
 * or leave one here that the schema drops, and the API fails to compile. That
 * check is the thing that makes this file trustworthy; without it this is just
 * an eighth copy.
 *
 * ## Adding a value
 *
 * Prisma schema first, then here, then run the API's typecheck. Backend first
 * is not ceremony — it is the direction that cannot produce a value the
 * database is unable to store.
 */

/**
 * Mirrors `enum UserRole` in `prisma/schema.prisma`.
 *
 * Order is significant to readers but carries no authority: it runs from most
 * privileged to least, which is the order the role-creation matrix reads in.
 * Nothing derives permissions from the position.
 */
export const USER_ROLES = [
  'SUPER_ADMIN',
  'HR_ADMIN',
  'TEAM_LEAD',
  'EMPLOYEE',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Mirrors `enum UserStatus` in `prisma/schema.prisma`. */
export const USER_STATUSES = [
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'DELETED',
] as const;

export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * The statuses a user can be in and still appear in a list.
 *
 * `DELETED` is excluded because `UsersService.findAll` filters those rows out
 * before they reach any client. This is a **narrowing for display**, not a
 * second source of truth: it is derived from `UserStatus` above, so a new
 * status cannot appear here without being a real one first.
 */
export type VisibleUserStatus = Exclude<UserStatus, 'DELETED'>;

/** Runtime guards, for narrowing values that arrive as plain strings. */
export function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value)
  );
}

export function isUserStatus(value: unknown): value is UserStatus {
  return (
    typeof value === 'string' &&
    (USER_STATUSES as readonly string[]).includes(value)
  );
}
