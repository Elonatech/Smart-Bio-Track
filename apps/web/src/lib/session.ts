import { appClient, refreshAccessToken } from "./api-client";
import {
  toAuthUser,
  useAuthStore,
  type MeResponse,
} from "./store/auth-store";

/**
 * Rebuilds the session on app load.
 *
 * The auth store keeps nothing in localStorage any more, so a page refresh
 * leaves this tab with no access token and no user. What survives a refresh is
 * the httpOnly refresh cookie, which this code cannot read — only send. So the
 * restore is a question for the server: "here is my cookie, is this still a
 * session?"
 *
 *   1. POST /auth/refresh — the browser attaches the cookie, the server
 *      rotates it and returns a fresh access token.
 *   2. GET /auth/me — with that token, fetch who the user actually is.
 *
 * Step two matters beyond convenience. The user object used to be cached in
 * localStorage and read straight back, which meant a role someone had edited
 * by hand rendered admin navigation until the API refused a request. Asking
 * the server every load means the UI reflects the real role, including one
 * changed by an admin since the last sign-in.
 *
 * A failure here is the normal case for a signed-out visitor, not an error
 * worth surfacing: no cookie, expired cookie, revoked session all land the
 * same way. It resolves either way; `hasRestored` is what unblocks the guards.
 */
export async function restoreSession(): Promise<void> {
  const store = useAuthStore.getState();

  try {
    const accessToken = await refreshAccessToken();

    const me = await appClient.get<MeResponse>("/auth/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    store.login(toAuthUser(me.data), accessToken);
  } catch {
    // Not signed in, or the session is over. Either way there is nothing to
    // restore and nothing to tell the user — they are simply logged out.
    store.clearSession();
  } finally {
    store.markRestored();
  }
}

/**
 * Signs out for real.
 *
 * The API call is what matters: this code cannot delete the httpOnly cookie
 * itself, so clearing local state alone would leave a live refresh cookie in
 * the browser and the next page load would silently sign the user back in.
 * The server revokes the token and clears the cookie; we drop the local half.
 *
 * `all` revokes every session for the user, not just this browser — the right
 * choice when someone suspects their account is compromised.
 */
export async function signOut({ all = false }: { all?: boolean } = {}) {
  try {
    await appClient.post("/auth/logout", { all });
  } catch {
    // A failed revoke must not strand someone on a dashboard they asked to
    // leave. The local session goes regardless; the refresh token expires on
    // its own within the week even if the call never landed.
  } finally {
    useAuthStore.getState().clearSession();
  }
}
