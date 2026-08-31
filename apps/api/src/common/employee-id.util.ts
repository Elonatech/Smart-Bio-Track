import { randomInt } from 'crypto';

/**
 * Excludes 0/O and 1/I — this ID gets read aloud and retyped, so visually
 * ambiguous characters are worth the smaller alphabet.
 */
const EMPLOYEE_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const EMPLOYEE_ID_SUFFIX_LENGTH = 5;

/** e.g. "ADM-7K2X9". 32^5 (~33M) combinations — collisions are handled by the caller. */
export function generateEmployeeId(): string {
  let suffix = '';
  for (let i = 0; i < EMPLOYEE_ID_SUFFIX_LENGTH; i++) {
    suffix += EMPLOYEE_ID_ALPHABET[randomInt(EMPLOYEE_ID_ALPHABET.length)];
  }
  return `ADM-${suffix}`;
}
