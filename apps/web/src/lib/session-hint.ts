/**
 * A non-secret marker saying "this browser probably has a session".
 *
 * ## Why this exists at all
 *
 * Middleware runs on the server, before a page renders, and can only read
 * cookies the browser sent to *this* origin. The real credential — the httpOnly
 * refresh cookie — is unreadable to it twice over:
 *
 *  1. It is set by the **API**, on the API's host. The web app is a different
 *     origin, and in production a different subdomain.
 *  2. It is scoped `path=/api/auth`, so the browser would not attach it to a
 *     `/dashboard` navigation even if the hosts matched.
 *
 * Both of those are deliberate (see `refresh-cookie.ts`) and neither should be
 * relaxed to make routing easier. So the middleware cannot check a session; it
 * can only check a hint, and this is that hint.
 *
 * ## What it is NOT
 *
 * **This is not a security control, and must never be treated as one.** It is
 * an ordinary cookie written by client-side JavaScript. Anyone can set it in
 * their console and reach the dashboard shell — where every API call still
 * returns 401, because the server is what enforces access and always was.
 *
 * What it buys is honesty of presentation: a signed-out visitor is redirected
 * before protected HTML is sent, instead of being shown a dashboard skeleton
 * that JavaScript then snatches away. That is #16's actual complaint — leaked
 * structure and flashed UI, not a data breach.
 *
 * If it is ever tempting to put something real behind this cookie: don't. Put
 * it behind the access token, which the API verifies.
 */

export const SESSION_HINT_COOKIE = 'sbt_has_session';

/**
 * Matches REFRESH_TOKEN_TTL_DAYS on the API.
 *
 * If the two drift, the failure is mild and self-correcting: a hint outliving
 * its session means one redirect into a page that restores nothing and bounces
 * back to sign-in; a hint expiring early means a signed-in user is bounced to
 * the login page, which immediately forwards them on (see the login page's
 * restore effect). Neither loses data. Do not be tempted to make it permanent
 * to "fix" the first case — a permanent hint makes every signed-out visitor
 * take the long route through a failed restore.
 */
const HINT_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** Server rendering has no document; every function here is a no-op there. */
function canUseCookies(): boolean {
  return typeof document !== 'undefined';
}

export function setSessionHint(): void {
  if (!canUseCookies()) return;

  // `Secure` only when the page is actually on https — localhost is not, and a
  // Secure cookie there is silently dropped, which would leave middleware
  // redirecting signed-in developers to the login page on every navigation.
  const secure = location.protocol === 'https:' ? '; Secure' : '';

  document.cookie = `${SESSION_HINT_COOKIE}=1; Path=/; Max-Age=${HINT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

export function clearSessionHint(): void {
  if (!canUseCookies()) return;

  // Same Path it was written with. A browser identifies a cookie by
  // (name, domain, path), so expiring it from a different path silently does
  // nothing and leaves the old one in place — the bug that makes a sign-out
  // look successful and then sign the user back in on the next load.
  document.cookie = `${SESSION_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
