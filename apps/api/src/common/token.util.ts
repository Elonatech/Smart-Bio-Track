import { createHash, randomBytes } from 'crypto';

/**
 * Shared helpers for every opaque secret we hand out and later look up:
 * activation tokens, password-reset tokens, and refresh tokens.
 *
 * In all three cases the raw value goes to the user exactly once and only its
 * digest is stored, so a leak of the table yields nothing directly usable.
 */

/** Invite validity — how long a provisioning link stays usable. */
export const ACTIVATION_TOKEN_TTL_DAYS = 7;

/**
 * Org-signup verification link validity. 7 days for MVP while volume is low;
 * drop to 2 once there's real signup traffic to abuse it with.
 */
export const PENDING_ORG_SIGNUP_TOKEN_TTL_DAYS = 7;

/** Password-reset links are deliberately short-lived. */
export const PASSWORD_RESET_TOKEN_TTL_MINUTES = 30;

/** Refresh-token lifetime, matching JWT_REFRESH_EXPIRY's 7-day default. */
export const REFRESH_TOKEN_TTL_DAYS = 7;

/** 32 random bytes, hex-encoded. Returned to the caller once, never stored. */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * SHA-256 rather than argon2 on purpose. These tokens are 32 random bytes, so
 * there is nothing to brute-force, and we need a *deterministic* digest to look
 * the record up by — argon2's per-call random salt would make lookup
 * impossible. Passwords, which are low-entropy, still use argon2.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function expiryInDays(days: number, from: Date = new Date()): Date {
  const expiresAt = new Date(from);
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt;
}

export function expiryInMinutes(
  minutes: number,
  from: Date = new Date(),
): Date {
  return new Date(from.getTime() + minutes * 60_000);
}
