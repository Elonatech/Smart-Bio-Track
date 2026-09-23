import * as argon2 from 'argon2';
import {
  PASSWORD_HASH_OPTIONS,
  hashPassword,
  needsPasswordRehash,
} from './password.util';

/**
 * Real argon2, deliberately not mocked.
 *
 * Every other auth spec calls `jest.mock('argon2')`, which is right for testing
 * *our* logic — but it makes the library's actual behaviour unobservable, and
 * the library's actual behaviour is the entire subject here. These tests are
 * slower than the rest of the suite (roughly 90ms per hash, by design) and that
 * cost is the thing being asserted.
 */
describe('password hashing parameters', () => {
  // Generous: argon2 is intentionally slow and CI machines are not fast.
  jest.setTimeout(30_000);

  it('produces argon2id hashes at the parameters we chose', async () => {
    const hash = await hashPassword('correct horse battery staple');

    // The parameters are encoded in the hash itself, which is why this can be
    // asserted from the output rather than trusted from the input.
    expect(hash).toContain('$argon2id$');
    expect(hash).toContain('m=47104'); // 46 MiB
    expect(hash).toContain('t=1');
    expect(hash).toContain('p=1');
  });

  // The real point of this file.
  //
  // The defect behind #20 was four calls to argon2.hash with no options, so the
  // cost of every sign-in in the product was whatever the library happened to
  // default to — changeable by a dependency upgrade, with no code change and no
  // failing test. This pins it.
  it('does not silently inherit the library defaults', async () => {
    const ours = await hashPassword('pw');
    const theirs = await argon2.hash('pw');

    expect(theirs).toContain('m=65536'); // the default: 64 MiB, p=4, t=3
    expect(ours).not.toContain('m=65536');
    expect(ours).not.toEqual(theirs);
  });

  it('round-trips a password it hashed', async () => {
    const hash = await hashPassword('Passw0rd!');

    await expect(argon2.verify(hash, 'Passw0rd!')).resolves.toBe(true);
    await expect(argon2.verify(hash, 'wrong')).resolves.toBe(false);
  });

  // Changing the parameters must never lock anyone out. A hash carries the
  // settings that made it, and verify reads them from there.
  it('still verifies a password hashed with the old defaults', async () => {
    const legacy = await argon2.hash('Passw0rd!'); // library defaults

    await expect(argon2.verify(legacy, 'Passw0rd!')).resolves.toBe(true);
  });

  describe('needsPasswordRehash', () => {
    it('flags a hash made with the old defaults', async () => {
      const legacy = await argon2.hash('Passw0rd!');

      expect(needsPasswordRehash(legacy)).toBe(true);
    });

    it('leaves a current hash alone', async () => {
      const current = await hashPassword('Passw0rd!');

      expect(needsPasswordRehash(current)).toBe(false);
    });
  });

  it('exports options the decoy hash can share', () => {
    // auth.service.ts hashes its decoy through hashPassword for exactly this
    // reason: a decoy cheaper than a real hash reopens #19's timing oracle in
    // the direction of "unknown accounts answer faster".
    expect(PASSWORD_HASH_OPTIONS.type).toBe(argon2.argon2id);
    expect(PASSWORD_HASH_OPTIONS.memoryCost).toBe(47104);
    expect(PASSWORD_HASH_OPTIONS.parallelism).toBe(1);
  });
});
