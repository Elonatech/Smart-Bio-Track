/**
 * The JWT signing secrets and lifetimes, read on first use rather than on
 * import.
 *
 * ## What was wrong
 *
 * This file used to call `process.env` at the top level:
 *
 * ```ts
 * export const JWT_ACCESS_SECRET = requireEnv('JWT_ACCESS_SECRET');
 * ```
 *
 * which runs the moment anything imports it — and the import chain reaches
 * here while `main.ts` is still being *loaded*, long before `bootstrap()` is
 * called. Two consequences, one live and one waiting:
 *
 * **Live: it made `env.validation.ts` unreachable.** A missing secret threw
 * `JWT_ACCESS_SECRET is required but was not set` from this file during module
 * loading, so `validateEnv()` — which is called inside `bootstrap()` — never
 * ran. Every message written there was dead code for this case, including the
 * check from #6 that the two secrets must *differ*, which is the one that
 * silently turns a 7-day refresh token into a valid access token.
 *
 * **Waiting: the boot order was one edit from breaking.** `main.ts` calls
 * `dotenv.config()` between its import statements, and it works only because
 * TypeScript emits those requires in source order. An `import/order` lint rule,
 * an IDE "organize imports", or a move to native ESM — where imports really are
 * hoisted — puts `dotenv.config()` after the app module loads, and the API dies
 * at boot with a message pointing at the wrong thing.
 *
 * ## What changed
 *
 * Functions, not constants. Nothing reads the environment until something asks
 * for a value, and by then `bootstrap()` has run `validateEnv()` and Nest is
 * constructing providers. The ordering stops mattering, which is the actual
 * fix — not the caching, which is incidental.
 *
 * The values are still memoised, so a rotated secret does not take effect until
 * restart. That is deliberate: tokens signed with the old secret stay valid for
 * their lifetime either way, and re-reading `process.env` per request would
 * cost a lookup on the hot path to support something nobody does.
 *
 * ## Why not ConfigService
 *
 * The register suggested it. It would mean `ConfigModule.forRoot`, injection
 * into `JwtStrategy` and `AuthService`, and `JwtModule.registerAsync` — and it
 * would leave this project with **two** sources of truth about the environment,
 * since `env.validation.ts` already validates everything with zod and produces
 * better messages than ConfigService's. The problem to solve was *when* the
 * value is read, not *who* holds it.
 */

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    // Reachable only if something asks for a secret without `validateEnv()`
    // having run — a test that boots a module directly, for instance. In the
    // real application the zod validation fails first, with a better message.
    throw new Error(
      `${name} is required but was not set. ` +
        'If this surfaced at boot, validateEnv() should have caught it first — ' +
        'check that bootstrap() runs before anything reads a secret.',
    );
  }

  return value;
}

let accessSecret: string | undefined;
let refreshSecret: string | undefined;

export function jwtAccessSecret(): string {
  accessSecret ??= requireEnv('JWT_ACCESS_SECRET');
  return accessSecret;
}

export function jwtRefreshSecret(): string {
  refreshSecret ??= requireEnv('JWT_REFRESH_SECRET');
  return refreshSecret;
}

/** Short by design — the refresh token is what carries a session forward. */
export function jwtAccessExpiry(): string {
  return process.env.JWT_ACCESS_EXPIRY || '15m';
}

export function jwtRefreshExpiry(): string {
  return process.env.JWT_REFRESH_EXPIRY || '7d';
}
