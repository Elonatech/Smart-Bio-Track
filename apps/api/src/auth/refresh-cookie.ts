import type { CookieOptions, Request, Response } from 'express';
import { REFRESH_TOKEN_TTL_DAYS } from '../common/token.util';

/**
 * Transport for the refresh token.
 *
 * The refresh token is the long-lived half of a session — seven days, and it
 * mints access tokens on demand. It used to be returned in the login response
 * body and kept in localStorage, which means any script running on the page
 * could read it: one XSS, one bad dependency, one compromised CDN script, and
 * an attacker holds a week of the victim's session. A 15-minute access-token
 * expiry buys nothing while the thing that renews it sits in readable storage.
 *
 * As an httpOnly cookie it is unreadable from JavaScript entirely. The browser
 * attaches it to the auth routes and nothing else has to touch it.
 *
 * Moving a credential from a header into a cookie normally *introduces* CSRF,
 * because browsers send cookies automatically while an Authorization header is
 * immune by construction. Four things keep that contained here:
 *
 *  1. Only the refresh token moves. The access token stays an Authorization
 *     header, so every data route is exactly as CSRF-immune as it was.
 *  2. `path` scopes the cookie to the auth routes — it is not even sent to
 *     /api/users.
 *  3. `sameSite: 'lax'` stops the browser sending it on a cross-site POST, and
 *     both routes that consume it are POST.
 *  4. A CSRF that somehow landed would gain nothing anyway: CORS stops the
 *     attacker reading the response, so they rotate the victim's token and
 *     learn none of it.
 *
 * DEPLOYMENT CONSTRAINT: `sameSite: 'lax'` requires the web app and this API to
 * be same-site in production — app.example.com and api.example.com share the
 * registrable domain `example.com` and work. Hosting them on unrelated domains
 * (a *.vercel.app frontend against a *.onrender.com API) is cross-site, the
 * cookie is not sent, and sign-in fails in production while working perfectly
 * on localhost. Going that route needs `sameSite: 'none'` plus real CSRF
 * tokens, which is a larger change than flipping this string.
 */
export const REFRESH_COOKIE_NAME = 'sbt_refresh';

/**
 * Scoped to the auth routes. `/api` is the global prefix (app.setup.ts), so
 * this covers /api/auth/refresh and /api/auth/logout and excludes everything
 * else — the cookie never rides along on an ordinary data request.
 */
const REFRESH_COOKIE_PATH = '/api/auth';

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    // Refused by the browser over plain http, which is what localhost serves.
    // On in production, where it stops the cookie crossing the network in the
    // clear.
    secure: isProduction(),
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
  };
}

/** Attaches a rotated or newly issued refresh token to the response. */
export function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...baseOptions(),
    maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

/**
 * Removes the cookie on sign-out.
 *
 * The attributes have to match the ones it was set with — a browser treats
 * (name, domain, path) as the identity of a cookie, so clearing it from a
 * different path silently does nothing and leaves the old cookie in place.
 */
export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions());
}

/**
 * Reads the refresh token out of the request's Cookie header.
 *
 * Hand-parsed rather than pulling in cookie-parser: we need exactly one cookie,
 * its value is a JWT (`A-Za-z0-9-_.` only, so nothing that needs unquoting or
 * percent-decoding), and adding a dependency to this workspace has broken
 * pnpm-workspace.yaml before. Swap in cookie-parser and read `req.cookies` here
 * if that calculus ever changes — this is the only place that would move.
 */
export function readRefreshCookie(req: Request): string | undefined {
  const header = req.headers.cookie;

  if (!header) {
    return undefined;
  }

  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');

    if (separator === -1) {
      continue;
    }

    if (pair.slice(0, separator).trim() === REFRESH_COOKIE_NAME) {
      const value = pair.slice(separator + 1).trim();
      return value.length > 0 ? value : undefined;
    }
  }

  return undefined;
}
