import { create } from "zustand";
import { clearSessionHint, setSessionHint } from "@/lib/session-hint";
import type { MeResponse } from "@smartbiotrack/types";
import type { UserRole } from "@smartbiotrack/types";

// The set of roles a logged-in user can have.
//
// No longer written out here. It comes from packages/types, which the API's
// shared-enums.spec.ts holds — at compile time, in both directions — to the
// `UserRole` enum in prisma/schema.prisma. Re-exported so the dozens of
// existing `import type { UserRole } from "@/lib/store/auth-store"` lines keep
// working; the definition simply moved somewhere that cannot drift.
//
// It used to list a fifth role, PLATFORM_ADMIN, annotated "not in the backend's
// Prisma enum yet". That "yet" held for the whole of Phase 2: no user could
// ever hold the role, so every branch written for it — a nav menu, a route, a
// role-matrix entry — was unreachable code that read as a working feature.
// Removed 18 Sep 2026. If the Org/Platform split is built, it starts in the
// Prisma schema, because a role tied to no organization has to answer for every
// org-scoped query first.
export type { UserRole };

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
  // Nullable because /auth/me can return null for it, not because any current
  // role is org-less. The old note here said "null for Platform Admin" — a role
  // that never existed. Every role we actually have belongs to an organization.
  organizationId: string | null;
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

// The raw body of GET /auth/me — now defined once, in packages/types, and
// annotated on the API's own handler (#26).
//
// It used to be declared here and restated nowhere else only because an earlier
// fix had already collapsed three copies into one. That was an improvement and
// still left the browser guessing: this interface described what somebody
// believed the API returned, and nothing anywhere compared the two.
//
// Re-exported so existing imports keep working; the definition simply moved
// somewhere both halves can see.
export type { MeResponse };

export function toAuthUser(
  me: MeResponse,
  fallbacks: Partial<Pick<AuthUser, "name" | "organizationName">> = {}
): AuthUser {
  return {
    id: me.id,
    // The wire guarantees these now, so the fallbacks cover one real case:
    // Sign Up renders the new admin's details from the form before the first
    // /auth/me round trip has happened at all.
    name: me.name || fallbacks.name,
    email: me.email,
    role: me.role,
    organizationId: me.organizationId,
    organizationName: me.organizationName || fallbacks.organizationName,
    departmentId: me.departmentId,
    departmentName: me.departmentName,
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

  // The session hint is written and cleared here, in the three places session
  // state actually changes, rather than at each call site. Scattering it would
  // guarantee that some future sign-out path forgets it and leaves middleware
  // waving signed-out visitors through to a dashboard shell.
  login: (user, accessToken) => {
    setSessionHint();
    set({ user, accessToken, isAuthenticated: true, hasRestored: true });
  },

  // A successful sign-up logs the new Org Super Admin straight in — same
  // shape as login, no separate "session" concept.
  register: (user, accessToken) => {
    setSessionHint();
    set({ user, accessToken, isAuthenticated: true, hasRestored: true });
  },

  setAccessToken: (accessToken) => set({ accessToken }),

  clearSession: () => {
    clearSessionHint();
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      // Stays true: the restore attempt is over. Resetting it here would put
      // guards back into their loading state and hang the UI after sign-out.
      hasRestored: true,
    });
  },

  markRestored: () => set({ hasRestored: true }),
}));
