import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_HINT_COOKIE } from '@/lib/session-hint';

/**
 * Keeps protected HTML off the wire for visitors with no session.
 *
 * Named `proxy.ts`, not `middleware.ts`. Next 16 renamed the convention and
 * warns on the old filename at build time; the API is unchanged. The export
 * must be named `proxy` or be the default, or Next ignores the file entirely
 * and every route silently becomes public again.
 *
 * Route protection used to be a client component alone (`AuthGuard`). The
 * server therefore sent the dashboard document to anyone who asked, and
 * JavaScript hid it afterwards. Not a data breach — every figure on those
 * screens arrives from the API, which checks the access token and always did —
 * but two real problems:
 *
 *  * **It published the shape of the product.** Anyone could read the route
 *    names, the navigation and the role structure without an account.
 *  * **It flashed.** A signed-out visitor saw a dashboard skeleton for a beat
 *    before being replaced by a sign-in prompt, which reads as a bug.
 *
 * ## What this can and cannot know
 *
 * It cannot verify a session. The refresh cookie is httpOnly, set on the API's
 * host, and scoped to `/api/auth` — so it is never sent to a `/dashboard`
 * navigation on the web origin. All that is readable here is the hint cookie,
 * which the browser sets and anybody could forge.
 *
 * **So this is presentation, not access control.** A forged hint gets you an
 * empty dashboard shell whose every request 401s. `AuthGuard` still runs, the
 * API still enforces, and neither is redundant: this stops the HTML leaving,
 * the guard handles a session that ends mid-visit, and the API is the only one
 * of the three that decides anything.
 *
 * Three layers sounds like a lot for one question. They answer different ones:
 * *should this document be sent?*, *should this component render?*, and *should
 * this data be returned?* Only the last is security.
 */

/** Everything below these prefixes requires a session. */
const PROTECTED_PREFIXES = ['/dashboard'];

/**
 * Pages a signed-in user should not be sitting on.
 *
 * Only the ones that would be actively confusing. Password reset and
 * registration completion are deliberately absent: both are reached from an
 * emailed link, and someone signed in on another tab following a reset link
 * must be allowed to finish.
 */
const SIGNED_OUT_ONLY = ['/auth/login', '/auth/register'];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasHint = request.cookies.has(SESSION_HINT_COOKIE);

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !hasHint) {
    const login = new URL('/auth/login', request.url);

    // Carry where they were going, so signing in lands them there rather than
    // on a generic dashboard. A deep link shared in a chat is the normal way
    // somebody meets this redirect.
    //
    // `pathname + search` only — never an absolute URL from user input, which
    // is how open-redirect bugs are written.
    login.searchParams.set('next', `${pathname}${search}`);

    return NextResponse.redirect(login);
  }

  if (hasHint && SIGNED_OUT_ONLY.includes(pathname)) {
    // Deliberately the generic dashboard entry, not a role-specific path: the
    // role lives in the access token, which this cannot read. /dashboard sorts
    // it out once the session is restored.
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Skip Next's internals, the API proxy routes and anything that looks like a
   * file. Running on every asset request would put a cookie check in front of
   * every image on the page for no benefit.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
