import { validateEnv } from './env.validation';

/**
 * validateEnv reads process.env directly and throws on a bad configuration,
 * which is what stops the API booting with, say, a one-character signing key.
 * These tests swap the whole environment in and out around each case.
 */
describe('validateEnv', () => {
  const originalEnv = process.env;

  /** 64 hex characters — what `openssl rand -hex 32` produces. */
  const strongSecret = (seed: string) => seed.repeat(64).slice(0, 64);

  const validEnv = {
    DATABASE_URL: 'postgresql://user:pw@localhost:5432/db',
    JWT_ACCESS_SECRET: strongSecret('a'),
    JWT_REFRESH_SECRET: strongSecret('b'),
    BREVO_API_KEY: 'brevo-key',
    BREVO_SENDER_EMAIL: 'noreply@example.com',
  };

  const withEnv = (overrides: Record<string, string | undefined>) => {
    process.env = { ...validEnv, ...overrides } as NodeJS.ProcessEnv;
    return validateEnv;
  };

  afterEach(() => {
    process.env = originalEnv;
  });

  it('accepts a valid configuration', () => {
    expect(() => withEnv({})()).not.toThrow();
  });

  describe('JWT secrets', () => {
    it.each([
      ['JWT_ACCESS_SECRET', 'x'],
      ['JWT_REFRESH_SECRET', 'x'],
      ['JWT_ACCESS_SECRET', 'short-but-not-absurd'],
    ])('rejects a %s of %p as too short', (key, value) => {
      // A one-character HS256 secret is brute-forceable offline, and anyone who
      // recovers it can mint a token for any user with any role. `z.string()`
      // on its own accepted exactly this and booted.
      expect(() => withEnv({ [key]: value })()).toThrow(
        /at least 32 characters/,
      );
    });

    it('accepts a secret of exactly 32 characters', () => {
      expect(() =>
        withEnv({ JWT_ACCESS_SECRET: 'a'.repeat(32) })(),
      ).not.toThrow();
    });

    it('rejects the two secrets being the same value', () => {
      // Privilege escalation, not untidiness: the two token types share a
      // payload shape, so one shared secret means a 7-day refresh token
      // verifies as a 15-minute access token in an Authorization header.
      const shared = strongSecret('c');

      expect(() =>
        withEnv({
          JWT_ACCESS_SECRET: shared,
          JWT_REFRESH_SECRET: shared,
        })(),
      ).toThrow(/must not be the same value/);
    });

    it('reports a missing secret rather than passing it through', () => {
      expect(() => withEnv({ JWT_ACCESS_SECRET: undefined })()).toThrow(
        /JWT_ACCESS_SECRET/,
      );
    });
  });

  describe('ENABLE_API_DOCS', () => {
    it('is undefined when unset, so main.ts can fall back to NODE_ENV', () => {
      expect(withEnv({})().ENABLE_API_DOCS).toBeUndefined();
    });

    it('parses "true" as true', () => {
      expect(withEnv({ ENABLE_API_DOCS: 'true' })().ENABLE_API_DOCS).toBe(true);
    });

    it('parses "false" as FALSE, not true', () => {
      // The reason this is an enum and not z.coerce.boolean(): coercion treats
      // every non-empty string as true, so ENABLE_API_DOCS="false" would
      // publish the full API surface in production — the exact opposite of
      // what whoever set it meant.
      expect(withEnv({ ENABLE_API_DOCS: 'false' })().ENABLE_API_DOCS).toBe(
        false,
      );
    });

    it.each(['yes', 'TRUE', '1', ''])('rejects %p rather than guessing', (value) => {
      expect(() => withEnv({ ENABLE_API_DOCS: value })()).toThrow(
        /ENABLE_API_DOCS/,
      );
    });
  });

  describe('NODE_ENV', () => {
    it('accepts the three known environments', () => {
      for (const value of ['development', 'test', 'production']) {
        expect(() => withEnv({ NODE_ENV: value })()).not.toThrow();
      }
    });

    it('is optional, because nothing sets it in local development', () => {
      expect(() => withEnv({ NODE_ENV: undefined })()).not.toThrow();
    });

    it('rejects a typo instead of silently treating it as non-production', () => {
      // "producton" would disable neither the docs nor the secure cookie flag,
      // and nothing would say so.
      expect(() => withEnv({ NODE_ENV: 'producton' })()).toThrow(/NODE_ENV/);
    });
  });
});
