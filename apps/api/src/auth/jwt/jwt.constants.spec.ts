/**
 * Pins the one property that matters here: **importing this module must not
 * read the environment.**
 *
 * The old version did, which made `env.validation.ts` unreachable for a missing
 * secret — the import chain threw during module loading, before `bootstrap()`
 * ever called `validateEnv()`, so every message written there (including #6's
 * "the two secrets must differ") was dead code for that case.
 *
 * `jest.isolateModules` gives each test a fresh module registry, because the
 * module memoises its values and a copy loaded by an earlier test would
 * otherwise answer for this one.
 *
 * It loads through `require` rather than a dynamic `import()`: this project
 * compiles with `moduleResolution: nodenext`, where a dynamic import is modelled
 * as real ESM and must carry a file extension, while `require` in a CommonJS
 * suite does not. Jest runs these as CommonJS, so `require` is both what
 * actually happens and the form that typechecks.
 */
import type * as JwtConstantsModule from './jwt.constants';

/** Loads a fresh copy of the module, with its memoised state reset. */
function loadFresh(): typeof JwtConstantsModule {
  let loaded: typeof JwtConstantsModule;

  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('./jwt.constants') as typeof JwtConstantsModule;
  });

  return loaded!;
}

describe('jwt constants', () => {
  const realEnv = process.env;

  beforeEach(() => {
    process.env = { ...realEnv };
  });

  afterAll(() => {
    process.env = realEnv;
  });

  it('can be imported with no environment at all', () => {
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;

    // The assertion is that this line does not throw. Before the change it
    // did, and it took the application's own validation down with it.
    expect(() => loadFresh()).not.toThrow();
  });

  it('throws only when a secret is actually asked for', () => {
    delete process.env.JWT_ACCESS_SECRET;

    const { jwtAccessSecret } = loadFresh();

    expect(() => jwtAccessSecret()).toThrow(/JWT_ACCESS_SECRET is required/);
  });

  it('reads a value set after the module was loaded', () => {
    // This is the whole point. dotenv, validateEnv and Nest's module
    // construction all happen after imports resolve; a value set by any of
    // them has to be visible.
    delete process.env.JWT_ACCESS_SECRET;

    const { jwtAccessSecret } = loadFresh();

    process.env.JWT_ACCESS_SECRET = 'set-after-import-0000000000000000';

    expect(jwtAccessSecret()).toBe('set-after-import-0000000000000000');
  });

  it('keeps the access and refresh secrets apart', () => {
    // Cheap, and it guards the failure #6 exists to prevent: one shared secret
    // means a 7-day refresh token authenticates as a 15-minute access token.
    process.env.JWT_ACCESS_SECRET = 'access-secret-000000000000000000';
    process.env.JWT_REFRESH_SECRET = 'refresh-secret-00000000000000000';

    const { jwtAccessSecret, jwtRefreshSecret } = loadFresh();

    expect(jwtAccessSecret()).not.toBe(jwtRefreshSecret());
  });

  describe('lifetimes', () => {
    it('falls back to sensible defaults', () => {
      delete process.env.JWT_ACCESS_EXPIRY;
      delete process.env.JWT_REFRESH_EXPIRY;

      const { jwtAccessExpiry, jwtRefreshExpiry } = loadFresh();

      expect(jwtAccessExpiry()).toBe('15m');
      expect(jwtRefreshExpiry()).toBe('7d');
    });

    it('lets the environment override them', () => {
      process.env.JWT_ACCESS_EXPIRY = '5m';

      const { jwtAccessExpiry } = loadFresh();

      expect(jwtAccessExpiry()).toBe('5m');
    });
  });
});
