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

// ---------------------------------------------------------------------------
// Response shapes (#26)
//
// #25 gave the two halves one definition of the *enums*. The shapes stayed
// hand-mirrored: `MeResponse` in the browser restated what `/auth/me` returns,
// `EmployeeListItem` restated `/users`, and each carried a comment asking
// whoever edited one to remember the other. That is the arrangement #25 existed
// to end.
//
// Enums could be held with a type-level equality check against Prisma. Shapes
// cannot — there is no generated counterpart to compare against, because the
// API's response is assembled by hand. So the coupling is built the other way
// round: **one definition here, and both sides annotated against it.**
//
//  * The API declares these as its return types, so returning something else
//    fails `tsc` in `apps/api`.
//  * The browser consumes them, so reading a field that is not here fails
//    `tsc` in `apps/web`.
//  * The `_KEYS` arrays exist because **types vanish at runtime**. A field the
//    API quietly starts or stops sending is invisible to TypeScript on the
//    browser side — nothing checks a JSON body against an interface. The e2e
//    suite asserts the real response against these arrays, which is the only
//    check here that survives compilation.
//
// Each array is held to its interface by the assertions at the bottom, so the
// two cannot drift from each other either.
// ---------------------------------------------------------------------------

/** Every field `GET /auth/me` returns. */
export const ME_RESPONSE_KEYS = [
  'id',
  'name',
  'email',
  'role',
  'organizationId',
  'organizationName',
  'departmentId',
  'departmentName',
] as const;

export type MeResponseKey = (typeof ME_RESPONSE_KEYS)[number];

/**
 * The signed-in user, as the wire carries them.
 *
 * Nothing is optional. The browser's old copy made every field optional on the
 * grounds that "an older deployment may not send them" — which sounds prudent
 * and costs more than it saves: an optional field is one TypeScript stops
 * asking about, so a field the API genuinely stopped sending produced no error
 * anywhere and a blank name on screen. If a deployment really is that far
 * behind, a loud failure is the better outcome.
 *
 * `organizationId` is nullable rather than optional — the API sends the key and
 * its value may legitimately be null.
 */
export interface MeResponse {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organizationId: string | null;
  organizationName: string | null;
  departmentId: string | null;
  departmentName: string | null;
}

/** Every field a row of `GET /users` carries. */
export const USER_LIST_ITEM_KEYS = [
  'id',
  'employeeId',
  'name',
  'email',
  'role',
  'status',
  'departmentId',
  'officeId',
  'createdAt',
] as const;

export type UserListItemKey = (typeof USER_LIST_ITEM_KEYS)[number];

/**
 * One row of the staff list.
 *
 * `createdAt` is a **string**, not a Date: this describes the wire, and JSON
 * has no date type. The browser's copy omitted this field entirely while the
 * API has always sent it — drift in the quiet direction, where the extra field
 * is simply ignored and nobody notices until somebody wants it.
 *
 * `status` is VisibleUserStatus rather than UserStatus because `findAll`
 * filters DELETED rows out before they reach any client.
 */
export interface UserListItem {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  role: UserRole;
  status: VisibleUserStatus;
  departmentId: string | null;
  officeId: string | null;
  createdAt: string;
}

/** The envelope every paginated list uses. */
export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// --- The key arrays and their interfaces, held together -------------------
//
// Compiles only if each array lists exactly the interface's keys. Add a field
// to an interface and forget the array — or the reverse — and this fails,
// which matters because the array is what the runtime check uses.

type ExactKeys<T, K extends string> = [Exclude<keyof T, K>] extends [never]
  ? [Exclude<K, keyof T>] extends [never]
    ? true
    : never
  : never;

const _meKeysMatch: ExactKeys<MeResponse, MeResponseKey> = true;
const _userListKeysMatch: ExactKeys<UserListItem, UserListItemKey> = true;

void _meKeysMatch;
void _userListKeysMatch;
