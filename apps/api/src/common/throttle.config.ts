import type { ThrottlerOptions } from '@nestjs/throttler';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Rate limits (PRTS §10 — "Rate Limiting").
 *
 * ONE named throttler, `default`, registered globally. Sensitive routes
 * tighten it with @Throttle({ default: ... }), which *replaces* the limit for
 * that route rather than adding a second one.
 *
 * Do not register a second named throttler globally: every registered
 * throttler applies to every route, so adding an `auth` bucket alongside
 * `default` silently rate-limits the whole API at the tighter figure. That
 * exact mistake was made and caught here on 20 Aug — `GET /api` was returning
 * 429 after four requests.
 *
 * Tracking is by client IP. Two known limits of that:
 *
 *  1. It does not stop a *distributed* attack on one account — a thousand IPs
 *     each trying five passwords stays under the limit. Per-identifier
 *     tracking and account lockout are the follow-ups.
 *  2. Counters live in this process's memory, so running more than one
 *     instance multiplies the effective limit. Redis storage is the fix when
 *     we scale horizontally.
 *
 * Both are recorded in docs/ENGINEERING_REFERENCE.md §5.
 */
export const THROTTLE_DEFAULT = {
  name: 'default',
  ttl: MINUTE,
  limit: 100,
} satisfies ThrottlerOptions;

/** Password guessing. */
export const THROTTLE_LOGIN = { default: { ttl: MINUTE, limit: 5 } };

/** Email enumeration and inbox spam — tighter than login. */
export const THROTTLE_FORGOT_PASSWORD = { default: { ttl: MINUTE, limit: 3 } };

/**
 * Token redemption. The tokens are 32 random bytes so guessing is already
 * infeasible; this stops someone burning the database with lookup queries.
 */
export const THROTTLE_TOKEN_REDEMPTION = { default: { ttl: MINUTE, limit: 5 } };

/** Refresh runs on a timer in normal use, so it needs more headroom. */
export const THROTTLE_REFRESH = { default: { ttl: MINUTE, limit: 10 } };

/** Spam organization creation — the only genuinely public write endpoint. */
export const THROTTLE_ORG_REGISTRATION = { default: { ttl: HOUR, limit: 3 } };
