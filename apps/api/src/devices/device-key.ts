import {
  createPublicKey,
  randomBytes,
  verify,
  type KeyObject,
} from 'node:crypto';

/**
 * The cryptography behind "this phone is the employee's phone" (Phase 4 plan
 * §4), kept pure so it can be tested without a database or a phone.
 *
 * The phone holds a private key in its secure hardware, unlockable only by
 * the employee's fingerprint, face or device PIN. We hold the public half.
 * A signature over a one-time challenge proves the phone was unlocked by its
 * owner just now — a yes/no from the phone's biometric prompt would prove
 * nothing, since a tampered app can simply say yes.
 */

/** Long enough that guessing is hopeless; base64 so it travels as text. */
export function newChallenge(): string {
  return randomBytes(32).toString('base64');
}

/**
 * The keys we accept, and nothing else:
 *   - RSA of at least 2048 bits, signing SHA256withRSA (PKCS#1 v1.5) — what
 *     Android's Keystore produced in the 25 Nov trial;
 *   - EC P-256, signing ECDSA with SHA-256 — what iPhones' Secure Enclave
 *     supports.
 * A smaller RSA key or another curve is refused at registration, so nothing
 * weaker can ever be the thing that vouches for a punch.
 */
export type KeyAlgorithm = `RSA_${number}_SHA256` | 'EC_P256_SHA256';

export class InvalidPublicKeyError extends Error {}

/**
 * Base64 DER (X.509 SubjectPublicKeyInfo) → a usable key and its label.
 * Whitespace is stripped first: Android's Base64.DEFAULT wraps lines.
 */
export function parsePublicKey(base64: string): {
  key: KeyObject;
  algorithm: KeyAlgorithm;
} {
  let key: KeyObject;
  try {
    key = createPublicKey({
      key: Buffer.from(base64.replace(/\s+/g, ''), 'base64'),
      format: 'der',
      type: 'spki',
    });
  } catch {
    throw new InvalidPublicKeyError('Not a public key in the expected format.');
  }

  const details = key.asymmetricKeyDetails ?? {};

  if (key.asymmetricKeyType === 'rsa') {
    const bits = details.modulusLength ?? 0;
    if (bits < 2048) {
      throw new InvalidPublicKeyError(
        `RSA keys must be at least 2048 bits; this one is ${bits}.`,
      );
    }
    return { key, algorithm: `RSA_${bits}_SHA256` };
  }

  if (key.asymmetricKeyType === 'ec' && details.namedCurve === 'prime256v1') {
    return { key, algorithm: 'EC_P256_SHA256' };
  }

  throw new InvalidPublicKeyError(
    'Only RSA (2048 bits or more) and EC P-256 keys are accepted.',
  );
}

/**
 * Whether `signature` (base64) is `publicKey`'s signature over `challenge`.
 *
 * The phone signs the challenge string itself, as UTF-8 — the same bytes it
 * was sent. Never throws: a malformed key or signature is simply "not valid",
 * so a caller cannot mistake a crash for anything else.
 */
export function verifyChallengeSignature(
  publicKey: string,
  challenge: string,
  signature: string,
): boolean {
  try {
    const { key } = parsePublicKey(publicKey);
    return verify(
      'sha256',
      Buffer.from(challenge, 'utf8'),
      key,
      Buffer.from(signature.replace(/\s+/g, ''), 'base64'),
    );
  } catch {
    return false;
  }
}
