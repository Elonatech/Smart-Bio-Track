import * as argon2 from 'argon2';

/**
 * How this system hashes passwords. One definition, used everywhere.
 *
 * The defect this closes was not really "the parameters are wrong" — it was
 * that there were **four independent calls to `argon2.hash` with no options**,
 * so the parameters were whatever the library shipped that week, and tuning
 * them meant finding every call site and hoping none was missed. A dependency
 * upgrade could have changed the cost of every sign-in in the product without
 * anyone editing a line of our code.
 *
 * ## The numbers, and why these ones
 *
 * Measured on the development machine, 21 Sep 2026, with the argon2 build this
 * project actually depends on — not taken from a blog post:
 *
 * ```
 *                            single    10 at once   peak RSS
 *   defaults m=64Mi t=3 p=4   102ms       1106ms      296MB
 *   m=46Mi t=1 p=1 (chosen)    90ms        306ms      195MB
 *   m=32Mi t=3 p=1            125ms        510ms      168MB
 *   m=19Mi t=2 p=1             47ms        213ms      116MB
 * ```
 *
 * `m=46Mi t=1 p=1` is one of OWASP's two recommended argon2id configurations
 * (the other being `m=19Mi t=2 p=1`; they are considered equivalent). It was
 * chosen because it **keeps the per-hash cost we already had** — 90ms against
 * 102ms — so an attacker guessing passwords gains nothing, while cutting peak
 * memory by a third and the ten-at-once time by 3.6x.
 *
 * ## Why `parallelism: 1` is doing most of the work
 *
 * The default `p=4` asks for four lanes per hash. Node runs argon2 on the libuv
 * thread pool, which is **four threads by default** — so four concurrent
 * sign-ins request sixteen lanes' worth of work across four slots and spend
 * their time contending rather than hashing. Dropping to one lane per hash is
 * what turns 1106ms into 306ms. It is not a security reduction: lanes are a
 * parallelism knob, and the memory and time costs are what an attacker has to
 * pay.
 *
 * ## What the measurement corrected
 *
 * The finding predicted "ten concurrent logins is 640 MiB". It is not, and the
 * reason matters: the thread pool caps genuine concurrency at four, so memory
 * **plateaus** at roughly four hashes' worth — 296MB measured at both ten and
 * fifty concurrent. What degrades without limit is **latency**. At fifty
 * simultaneous sign-ins on the defaults the last one waits 5.3 seconds, and
 * every other database call on the process is queued behind the same four
 * threads.
 *
 * So the risk was real but mis-stated: not a sudden memory spike, a slow
 * request queue that also happens to hold 296MB of a 512MB container while
 * Node's own heap and Prisma's connection pool need the rest.
 *
 * ## If you change these
 *
 * * **Existing hashes keep working.** An argon2 hash encodes its own parameters
 *   (`$argon2id$v=19$m=65536,p=4,t=3$...`), and `verify` reads them from the
 *   stored string rather than from this file. Nobody is locked out by a change
 *   here — which is also why old hashes stay expensive forever unless something
 *   rehashes them. `needsPasswordRehash` below is that something.
 * * **The decoy hash in `auth.service.ts` must use these same options.** It
 *   exists so a failed sign-in costs the same whether or not the account exists
 *   (#19). If it is cheaper than the real thing, the timing oracle reopens in
 *   the direction of "unknown accounts answer faster".
 * * **Raising `UV_THREADPOOL_SIZE` multiplies the memory.** It is the obvious
 *   response to the queueing described above and it trades one failure for a
 *   worse one: eight threads at 46 MiB is ~368MB of concurrent hashing.
 *
 * These numbers are a development-machine measurement, not a load test against
 * the deployment target. They are sound for choosing parameters and are **not**
 * a capacity plan; that needs the real container size and a real traffic shape.
 */
export const PASSWORD_HASH_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  /** 46 MiB, expressed in KiB as argon2 wants it. */
  memoryCost: 47104,
  timeCost: 1,
  parallelism: 1,
};

/** Hashes a password with this system's parameters. Use nothing else. */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, PASSWORD_HASH_OPTIONS);
}

/**
 * True when `hash` was produced with weaker settings than we now use.
 *
 * Called after a **successful** sign-in, which is the only moment the plaintext
 * password is in hand and can therefore be re-hashed. Without this, every
 * account created before today keeps its original cost for life, and changing
 * the parameters would only ever apply to people who join later.
 */
export function needsPasswordRehash(hash: string): boolean {
  return argon2.needsRehash(hash, PASSWORD_HASH_OPTIONS);
}
