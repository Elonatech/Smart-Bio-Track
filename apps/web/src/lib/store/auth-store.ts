import { create } from "zustand";

// The set of roles a logged-in user can have. This is a TypeScript
// "union type" — a UserRole can ONLY be one of these five exact strings.
// If you type a role anywhere that isn't in this list, TypeScript will
// error at compile time instead of letting a typo slip into production.
export type UserRole =
  | "EMPLOYEE"
  | "HR_ADMIN"
  | "TEAM_LEAD"
  | "SUPER_ADMIN"
  | "PLATFORM_ADMIN"; // not in the backend's Prisma enum yet — the Org/Platform admin split is still a pending backend decision

// Shape of the user object we keep in memory once someone is logged in.
// Mirrors what GET /auth/me returns (see the object JwtStrategy.validate
// returns in apps/api/src/auth/jwt/jwt.strategy.ts) — keep the two in step.
//
// `name` and `organizationName` stay optional only because Sign Up fills
// them from the form before the first /auth/me round trip completes.
export interface AuthUser {
  id: string;
  name?: string;
  email: string;
  role: UserRole;
  organizationId: string | null; // null for Platform Admin, who isn't tied to one org
  organizationName?: string;

  // The department this user belongs to, or null if they aren't assigned to
  // one. For a TEAM_LEAD this is the team they run.
  //
  // Display only. The server scopes a TEAM_LEAD's data to this department on
  // its own (UsersService.visibleUsersWhere) and does not read it from the
  // client — a value the browser can edit must never decide what data comes
  // back. Use it to label a page, never to filter one.
  departmentId?: string | null;
  departmentName?: string | null;
}

// The raw body of GET /auth/me.
//
// Declared once, here, on purpose. It used to be copy-pasted into
// login/page.tsx, complete-registration/page.tsx and
// verify-organization/page.tsx — three identical interfaces and three
// hand-written mappings into AuthUser. When the backend started returning
// `departmentName`, all three silently dropped it, and TypeScript said
// nothing: every added field is optional, and "absent" is legal for an
// optional field. Three copies of a type is three places to forget.
//
// Fields are optional here for a different reason than in AuthUser: an older
// API deployment genuinely may not send them, and the app should degrade
// rather than crash.
export interface MeResponse {
  id: string;
  name?: string;
  email: string;
  role: AuthUser["role"];
  organizationId: string | null;
  organizationName?: string;
  departmentId?: string | null;
  departmentName?: string | null;
}

/**
 * Maps GET /auth/me onto the user we keep in the store.
 *
 * The single place that mapping happens, so a new field on the backend is one
 * edit rather than a hunt through every page that signs someone in.
 *
 * `fallbacks` covers the signup flows: registration knows the admin's name and
 * organization from the form the user just filled in, which is worth keeping
 * if the API response hasn't caught up. It is only ever a fallback — whatever
 * the server says wins.
 */
export function toAuthUser(
  me: MeResponse,
  fallbacks: Partial<Pick<AuthUser, "name" | "organizationName">> = {}
): AuthUser {
  return {
    id: me.id,
    name: me.name ?? fallbacks.name,
    email: me.email,
    role: me.role,
    organizationId: me.organizationId,
    organizationName: me.organizationName ?? fallbacks.organizationName,
    departmentId: me.departmentId ?? null,
    departmentName: me.departmentName ?? null,
  };
}

// This describes everything the store holds (state) AND everything it
// can do (actions), all in one interface. Zustand doesn't force you to
// separate these, but writing the type this way documents both clearly.
//
// NOTHING HERE IS PERSISTED, and that is the point.
//
// This store used to write `accessToken` and `refreshToken` into
// localStorage. localStorage is readable by any script running on the page,
// so one XSS — a bad dependency, an injected script, a compromised CDN —
// handed an attacker a refresh token good for seven days. A 15-minute
// access-token expiry is worth nothing while the credential that renews it
// sits in readable storage next to it.
//
// Now: the refresh token is an httpOnly cookie the browser holds and
// JavaScript cannot read (see apps/api/src/auth/refresh-cookie.ts), and the
// access token lives here in memory only. A page refresh wipes this store,
// and `restoreSession` in lib/session.ts rebuilds it from the cookie.
interface AuthState {
  // ---- STATE ----
  user: AuthUser | null;      // null until someone signs in
  accessToken: string | null; // memory only — never written to storage
  isAuthenticated: boolean;   // so components don't all check `user !== null`
  /**
   * False until the one-time session restore on app load has finished, either
   * way. Guards render a spinner rather than the sign-in screen while it is
   * false — otherwise every refresh flashes "Sign in to continue" at someone
   * who is, in fact, signed in.
   */
  hasRestored: boolean;

  // ---- ACTIONS ----
  /** Starts a session. Called by the sign-in pages and by restoreSession. */
  login: (user: AuthUser, accessToken: string) => void;
  register: (user: AuthUser, accessToken: string) => void;
  /**
   * Replaces just the access token, leaving the user in place — what the
   * api-client's refresh interceptor calls after a silent rotation.
   */
  setAccessToken: (accessToken: string) => void;
  /**
   * Drops local session state. It does NOT clear the refresh cookie — only the
   * server can, since the whole point is that this code cannot touch it. Use
   * `signOut` in lib/session.ts for a real sign-out.
   */
  clearSession: () => void;
  /** Marks the initial restore attempt finished. */
  markRestored: () => void;
}

// `create<AuthState>()` builds the actual store. The function you pass in
// receives `set` (and normally `get`, which we don't need here) and must
// return the initial state + the action functions.
//
// Any React component can then call `useAuthStore()` (or, better,
// `useAuthStore((state) => state.user)` to only re-render when `user`
// specifically changes) to read this state or call these actions.
export const useAuthStore = create<AuthState>((set) => ({
  // Initial state on every page load. There is no stored session to read back
  // — restoreSession() asks the server instead, using the httpOnly cookie.
  user: null,
  accessToken: null,
  isAuthenticated: false,
  hasRestored: false,

  login: (user, accessToken) =>
    set({ user, accessToken, isAuthenticated: true, hasRestored: true }),

  // A successful sign-up logs the new Org Super Admin straight in — same
  // shape as login, no separate "session" concept.
  register: (user, accessToken) =>
    set({ user, accessToken, isAuthenticated: true, hasRestored: true }),

  setAccessToken: (accessToken) => set({ accessToken }),

  clearSession: () =>
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      // Stays true: the restore attempt is over. Resetting it here would put
      // guards back into their loading state and hang the UI after sign-out.
      hasRestored: true,
    }),

  markRestored: () => set({ hasRestored: true }),
}));
