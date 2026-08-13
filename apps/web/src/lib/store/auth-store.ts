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
  | "PLATFORM_ADMIN";


// Shape of the user object we keep in memory once someone is logged in.
// This should mirror (a subset of) whatever your backend's /auth/login
// or /auth/me endpoint returns.
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organizationId: string | null; // null for Platform Admin, who isn't tied to one org
}

// This describes everything the store holds (state) AND everything it
// can do (actions), all in one interface. Zustand doesn't force you to
// separate these, but writing the type this way documents both clearly.
interface AuthState {
  // ---- STATE ----
  user: AuthUser | null;       // null until someone logs in
  accessToken: string | null;  // the JWT we send on every API request
  isAuthenticated: boolean;    // convenience flag so components don't have to check `user !== null` everywhere
  isHydrated: boolean;         // true once we've checked localStorage on app load (see `hydrate` below)

  // ---- ACTIONS ----
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

  // Called after a successful login API call. It does two things:
  // 1. Persists the token + user to localStorage, so a page refresh
  //    doesn't log the user out (localStorage survives reloads; the
  //    in-memory Zustand store does not).
  // 2. Updates the in-memory store so the UI re-renders immediately
  //    (e.g. redirecting away from the login page).

  register : (user, accessToken) => {
    localStorage.setItem("accessToken", accessToken);
    localStorage.setItem("user", JSON.stringify(user));
    set({ user, accessToken, isAuthenticated: true });
  },

  login: (user, accessToken) => {
    localStorage.setItem("accessToken", accessToken);
    localStorage.setItem("user", JSON.stringify(user)); // localStorage only stores strings, so we serialize the object
    set({ user, accessToken, isAuthenticated: true });
  },

  // Clears both localStorage and in-memory state. Call this on
  // "Sign out" and also anywhere you detect an expired/invalid token
  // (e.g. a 401 response interceptor in api-client.ts).
  logout: () => {
    localStorage.removeItem("accessToken");
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
