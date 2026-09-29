import { NextRequest } from 'next/server';
import { proxy, config } from './proxy';
import { SESSION_HINT_COOKIE } from '@/lib/session-hint';

/**
 * The first tests this app has ever had, and this file first on purpose.
 *
 * `proxy` is a pure function — a request in, a redirect or a pass-through out —
 * so it is the cheapest thing here to pin. It is also the one whose failure is
 * **silent**: if the file or its export is renamed, Next stops running it
 * entirely and every dashboard route becomes public again with no error, no
 * warning, and nothing failing. The `config` assertions at the bottom exist for
 * exactly that.
 *
 * What these tests deliberately do NOT claim: that any of this is access
 * control. The hint cookie is forgeable and the proxy is presentation only —
 * the API is what refuses data. See session-hint.ts.
 */

const request = (path: string, { signedIn = false } = {}) =>
  new NextRequest(new URL(path, 'https://app.smartbiotrack.test'), {
    headers: signedIn ? { cookie: `${SESSION_HINT_COOKIE}=1` } : {},
  });

/** Where a redirect response points, or null if it is not a redirect. */
const redirectedTo = (response: Response): URL | null => {
  const location = response.headers.get('location');
  return location ? new URL(location) : null;
};

describe('proxy', () => {
  describe('a visitor with no session', () => {
    it.each([
      '/dashboard',
      '/dashboard/super-admin',
      '/dashboard/super-admin/audit-logs',
      '/dashboard/employee/attendance',
    ])('is redirected away from %s', (path) => {
      const target = redirectedTo(proxy(request(path)));

      expect(target?.pathname).toBe('/auth/login');
    });

    it('is told where they were going, so signing in lands them there', () => {
      const target = redirectedTo(
        proxy(request('/dashboard/super-admin/offices?page=2')),
      );

      expect(target?.searchParams.get('next')).toBe(
        '/dashboard/super-admin/offices?page=2',
      );
    });

    it('is left alone on public pages', () => {
      for (const path of ['/', '/about', '/contact', '/auth/login']) {
        expect(redirectedTo(proxy(request(path)))).toBeNull();
      }
    });

    // A path merely starting with the same letters is not inside the section.
    // `startsWith('/dashboard')` alone would treat /dashboards-are-fun as
    // protected, which is wrong in the harmless direction today and the wrong
    // rule regardless.
    it('is left alone on a path that only looks like the dashboard', () => {
      expect(redirectedTo(proxy(request('/dashboard-preview')))).toBeNull();
    });
  });

  describe('a visitor who appears to be signed in', () => {
    it('reaches the dashboard', () => {
      const response = proxy(request('/dashboard/super-admin', { signedIn: true }));

      expect(redirectedTo(response)).toBeNull();
    });

    it('is moved off the sign-in and registration pages', () => {
      for (const path of ['/auth/login', '/auth/register']) {
        const target = redirectedTo(proxy(request(path, { signedIn: true })));
        expect(target?.pathname).toBe('/dashboard');
      }
    });

    // Both are reached from an emailed link, and somebody signed in on another
    // tab must be able to finish the flow. Bouncing them to the dashboard would
    // make a reset link unusable for exactly the person who asked for it.
    it.each(['/reset-password', '/complete-registration'])(
      'is left alone on %s',
      (path) => {
        expect(redirectedTo(proxy(request(path, { signedIn: true })))).toBeNull();
      },
    );
  });

  describe('the matcher', () => {
    // These are not decoration. If the export or the matcher is wrong, Next
    // silently runs nothing and every route above becomes public — a failure
    // with no error message anywhere.
    it('exports a function named proxy', () => {
      expect(typeof proxy).toBe('function');
    });

    it('still has a matcher', () => {
      expect(config.matcher).toEqual(expect.any(Array));
      expect(config.matcher.length).toBeGreaterThan(0);
    });
  });
});
