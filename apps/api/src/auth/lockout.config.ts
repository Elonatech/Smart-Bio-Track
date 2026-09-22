/**
 * Account lockout — the limit that IP throttling cannot express.
 *
 * `THROTTLE_LOGIN` already caps sign-in attempts at five a minute **per client
 * IP**. That stops one machine hammering the login endpoint and stops nothing
 * else: a thousand addresses each trying five passwords against one account
 * stays under every per-IP limit, because no single address ever misbehaves.
 * Password guessing at scale does not look like abuse from any one vantage
 * point — which is why the counter has to live on the *account*.
 *
 * The two limits are complementary and neither replaces the other. IP
 * throttling bounds the traffic; this bounds the guesses against one person.
 *
 * ## The cost of having it
 *
 * Lockout is one of the few defences that hands an attacker a weapon. Anyone
 * who knows an employee's email address can now deliberately lock them out by
 * failing on purpose — a targeted denial of service against the person, using
 * the protection itself.
 *
 * That trade is accepted here, and these values are chosen because of it:
 *
 *  * **The lock expires.** A lock an administrator must clear turns a
 *    mistyped password into a support ticket, and turns the attack above into
 *    an indefinite one. Fifteen minutes costs an attacker continuous effort
 *    and costs the employee a coffee.
 *  * **The threshold is not tight.** Five consecutive failures is well beyond
 *    ordinary fumbling — a wrong saved password, caps lock, the old password
 *    after a change — so honest users rarely reach it.
 *
 * At 5 attempts per 15 minutes an attacker gets ~480 guesses a day against one
 * account. Against a password meeting `PASSWORD_REGEX` that is not a
 * meaningful threat; against "Password1!" nothing here saves anyone, which is
 * what the complexity rule is for.
 */

/** Consecutive failures before the account is locked. */
export const LOCKOUT_THRESHOLD = 5;

/** How long a lock lasts. */
export const LOCKOUT_DURATION_MINUTES = 15;

export function lockoutExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + LOCKOUT_DURATION_MINUTES * 60_000);
}
