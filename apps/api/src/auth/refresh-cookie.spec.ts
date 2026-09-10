import type { Request, Response } from 'express';
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie';

/**
 * The cookie is hand-parsed rather than delegated to cookie-parser (see
 * refresh-cookie.ts for why), so the parsing is covered here rather than
 * trusted. Everything below is a header a real browser can actually send.
 */
describe('refresh cookie', () => {
  const requestWithCookies = (header?: string) =>
    ({ headers: header === undefined ? {} : { cookie: header } }) as Request;

  describe('readRefreshCookie', () => {
    it('reads the token when it is the only cookie', () => {
      expect(
        readRefreshCookie(requestWithCookies(`${REFRESH_COOKIE_NAME}=abc.def`)),
      ).toBe('abc.def');
    });

    it('finds it among other cookies, in any position', () => {
      expect(
        readRefreshCookie(
          requestWithCookies(
            `theme=dark; ${REFRESH_COOKIE_NAME}=abc.def; locale=en-GB`,
          ),
        ),
      ).toBe('abc.def');

      expect(
        readRefreshCookie(
          requestWithCookies(`theme=dark; ${REFRESH_COOKIE_NAME}=abc.def`),
        ),
      ).toBe('abc.def');
    });

    it('keeps the whole JWT when the value contains "="', () => {
      // Base64url padding is the case that a naive split('=') would truncate,
      // handing the service a token that can never match a stored hash.
      expect(
        readRefreshCookie(
          requestWithCookies(`${REFRESH_COOKIE_NAME}=a.b.c==`),
        ),
      ).toBe('a.b.c==');
    });

    it('does not match a cookie whose name merely ends with ours', () => {
      // `other_sbt_refresh` contains the full cookie name as a suffix. Matching
      // on "contains" rather than equality would read the wrong cookie.
      expect(
        readRefreshCookie(
          requestWithCookies(`other_${REFRESH_COOKIE_NAME}=wrong`),
        ),
      ).toBeUndefined();
    });

    it('returns undefined when there is no cookie header at all', () => {
      expect(readRefreshCookie(requestWithCookies())).toBeUndefined();
    });

    it('returns undefined for an empty value rather than an empty string', () => {
      // A cleared cookie can arrive as `name=`. Returning '' would send a
      // falsy-but-present token into the lookup instead of failing cleanly.
      expect(
        readRefreshCookie(requestWithCookies(`${REFRESH_COOKIE_NAME}=`)),
      ).toBeUndefined();
    });

    it('ignores malformed segments without throwing', () => {
      expect(
        readRefreshCookie(
          requestWithCookies(`novalue; ${REFRESH_COOKIE_NAME}=abc.def; ;`),
        ),
      ).toBe('abc.def');
    });
  });

  describe('setRefreshCookie', () => {
    const responseSpy = () => ({ cookie: jest.fn() }) as unknown as Response;

    it('is httpOnly, lax and scoped to the auth routes', () => {
      const res = responseSpy();
      setRefreshCookie(res, 'a.b.c');

      const [name, value, options] = (res.cookie as jest.Mock).mock.calls[0] as [
        string,
        string,
        Record<string, unknown>,
      ];

      expect(name).toBe(REFRESH_COOKIE_NAME);
      expect(value).toBe('a.b.c');
      // httpOnly is the entire point: without it a script can read the token
      // and the change is cosmetic.
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe('lax');
      expect(options.path).toBe('/api/auth');
    });

    it('is not marked secure outside production, or the browser drops it on http', () => {
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const res = responseSpy();
      setRefreshCookie(res, 'a.b.c');

      const [, , options] = (res.cookie as jest.Mock).mock.calls[0] as [
        string,
        string,
        Record<string, unknown>,
      ];
      expect(options.secure).toBe(false);

      process.env.NODE_ENV = previous;
    });

    it('is marked secure in production', () => {
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const res = responseSpy();
      setRefreshCookie(res, 'a.b.c');

      const [, , options] = (res.cookie as jest.Mock).mock.calls[0] as [
        string,
        string,
        Record<string, unknown>,
      ];
      expect(options.secure).toBe(true);

      process.env.NODE_ENV = previous;
    });
  });

  describe('clearRefreshCookie', () => {
    it('clears with the same path it was set with', () => {
      // A browser identifies a cookie by (name, domain, path). Clearing from a
      // different path is a silent no-op that leaves the session cookie live.
      const res = { clearCookie: jest.fn() } as unknown as Response;
      clearRefreshCookie(res);

      const [name, options] = (res.clearCookie as jest.Mock).mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];

      expect(name).toBe(REFRESH_COOKIE_NAME);
      expect(options.path).toBe('/api/auth');
      expect(options.httpOnly).toBe(true);
    });
  });
});
