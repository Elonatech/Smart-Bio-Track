import { createHash, randomBytes } from 'crypto';

/** How long a provisioning invite stays valid. */
export const ACTIVATION_TOKEN_TTL_DAYS = 7;

/**
 * Generates a high-entropy activation token.
 *
 * The raw value is returned to the caller once (to hand to the invitee) and
 * never stored; only `hashActivationToken(raw)` is persisted.
 */
export function generateActivationToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * SHA-256 rather than argon2 on purpose: the token is 32 random bytes, so
 * there is nothing to brute-force, and we need a *deterministic* digest to
 * look the record up by. Argon2's per-call random salt would make lookup
 * impossible.
 */
export function hashActivationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function activationTokenExpiry(from: Date = new Date()): Date {
  const expiresAt = new Date(from);
  expiresAt.setDate(expiresAt.getDate() + ACTIVATION_TOKEN_TTL_DAYS);
  return expiresAt;
}
