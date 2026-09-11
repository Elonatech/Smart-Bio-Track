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
// `name` is optional: GET /auth/me currently returns only
// { id, email, role, organizationId } — no name. On Sign Up we already
// have the name from the form itself, so it's filled in there; on plain
// Login there's genuinely nowhere to get it from yet (flagged to
// backend — /auth/me should return name too).
//
// `organizationName` is the same situation: nowhere in the backend
// response yet (not on /auth/me, not on /auth/login). Left optional and
// undefined until backend adds it — the dashboard sidebar falls back to
// a generic label rather than fabricating a name.
export interface AuthUser {
  id: string;
  name?: string;
  email: string;
  role: UserRole;
  organizationId: string | null; // null for Platform Admin, who isn't tied to one org
  organizationName?: string;
}

// This describes everything the store holds (state) AND everything it
// can do (actions), all in one interface. Zustand doesn't force you to
// separate these, but writing the type this way documents both clearly.
interface AuthState {
  // ---- STATE ----
  user: AuthUser | null;       // null until someone logs in
  accessToken: string | null;  // short-lived JWT sent on every API request
  isAuthenticated: boolean;    // convenience flag so components don't have to check `user !== null` everywhere
  isHydrated: boolean;         // true once we've checked localStorage on app load (see `hydrate` below)

  // ---- ACTIONS ----
  // There is no refreshToken parameter: it lives in an httpOnly cookie the
  // browser manages, which JavaScript cannot read by design. Storing one here
  // would mean storing `undefined`.
  login: (user: AuthUser, accessToken: string) => void;
  register: (user: AuthUser, accessToken: string) => void;
  logout: () => void;
  hydrate: () => void;
}

// `create<AuthState>()` builds the actual store. The function you pass in
// receives `set` (and normally `get`, which we don't need here) and must
// return the initial state + the action functions.
//
// Any React component can then call `useAuthStore()` (or, better,
// `useAuthStore((state) => state.user)` to only re-render when `user`
// specifically changes) to read this state or call these actions.
export const useAuthStore = create<AuthState>((set) => ({
  // Initial state when the app first loads, before hydrate() runs.
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isHydrated: false,

  // Called after a successful login. Persists everything to
  // localStorage (survives page refresh) AND updates in-memory state
  // (so the UI re-renders immediately, e.g. redirecting off the login
  // page).
  login: (user, accessToken) => {
    localStorage.setItem("accessToken", accessToken);
    localStorage.setItem("user", JSON.stringify(user));
    set({ user, accessToken, isAuthenticated: true });
  },

  // Same shape as login — a successful Sign Up effectively logs the
  // new Org Super Admin in immediately, no separate "session" concept.
  register: (user, accessToken) => {
    localStorage.setItem("accessToken", accessToken);
    localStorage.setItem("user", JSON.stringify(user));
    set({ user, accessToken, isAuthenticated: true });
  },

  // Clears both localStorage and in-memory state. Call this on
  // "Sign out" and also anywhere you detect an expired/invalid token
  // (e.g. a 401 response interceptor in api-client.ts).
  // Clears local state only. The refresh cookie is httpOnly, so only the
  // server can remove it — Sidebar calls POST /auth/logout first, which
  // revokes the token and clears the cookie, then calls this.
  logout: () => {
    localStorage.removeItem("accessToken");
    // Left over from when the refresh token was stored here. Removed on every
    // logout so a browser carrying one from before the cookie change doesn't
    // keep a dead value in storage forever.
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    set({ user: null, accessToken: null, isAuthenticated: false });
  },

  // Zustand's in-memory state always resets to the initial values above
  // when the page is refreshed — it doesn't know anything happened
  // before this page load. `hydrate()` fixes that: it's called once,
  // when the app first mounts (see providers.tsx), and re-reads
  // whatever was saved in localStorage from a previous session.
  //
  // We can't just do this automatically in the initial state above,
  // because localStorage doesn't exist during server-side rendering —
  // it's a browser-only API. This function only ever runs on the
  // client, inside a useEffect, which is why it's a separate action
  // rather than part of the initial state.
  hydrate: () => {
    const accessToken = localStorage.getItem("accessToken");
    const rawUser = localStorage.getItem("user");

    // No longer requires a stored refresh token to restore a session. It
    // previously did, which would now lock out every returning user: the
    // value has moved into a cookie this code cannot see, so the check would
    // never pass. An access token that turns out to be expired is handled
    // where it always was — the 401 interceptor refreshes it.
    if (accessToken && rawUser) {
      set({
        user: JSON.parse(rawUser) as AuthUser, // turn the saved JSON string back into an object
        accessToken,
        isAuthenticated: true,
        isHydrated: true,
      });
    } else {
      // No saved session found — just mark hydration as done so the
      // app knows it's safe to render (e.g. show the login page
      // instead of a loading spinner).
      set({ isHydrated: true });
    }
  },
}));
