import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import {
  InvalidPublicKeyError,
  newChallenge,
  parsePublicKey,
  verifyChallengeSignature,
} from './device-key';

/** Public key as the phone sends it: base64 SPKI DER. */
const spki = (key: KeyObject) =>
  key.export({ type: 'spki', format: 'der' }).toString('base64');

/** Android's Base64.DEFAULT wraps at 76 characters with newlines. */
const wrapped = (b64: string) => `${b64.match(/.{1,76}/g)!.join('\n')}\n`;

const signed = (privateKey: KeyObject, challenge: string) =>
  sign('sha256', Buffer.from(challenge, 'utf8'), privateKey).toString('base64');

const rsa = (bits: number) =>
  generateKeyPairSync('rsa', { modulusLength: bits });
const ec = (namedCurve: string) => generateKeyPairSync('ec', { namedCurve });

describe('device-key', () => {
  const phone = rsa(2048);
  const iphone = ec('prime256v1');

  describe('parsePublicKey', () => {
    it('accepts the Android trial key: RSA-2048, newline-wrapped', () => {
      expect(parsePublicKey(wrapped(spki(phone.publicKey))).algorithm).toBe(
        'RSA_2048_SHA256',
      );
    });

    it('accepts a larger RSA key, labelled with its size', () => {
      expect(parsePublicKey(spki(rsa(3072).publicKey)).algorithm).toBe(
        'RSA_3072_SHA256',
      );
    });

    it('accepts EC P-256, the iPhone Secure Enclave key', () => {
      expect(parsePublicKey(spki(iphone.publicKey)).algorithm).toBe(
        'EC_P256_SHA256',
      );
    });

    it('refuses RSA under 2048 bits', () => {
      expect(() => parsePublicKey(spki(rsa(1024).publicKey))).toThrow(
        InvalidPublicKeyError,
      );
    });

    it('refuses another EC curve', () => {
      expect(() => parsePublicKey(spki(ec('secp384r1').publicKey))).toThrow(
        InvalidPublicKeyError,
      );
    });

    it('refuses something that is not a key', () => {
      expect(() => parsePublicKey('bm90IGEga2V5')).toThrow(
        InvalidPublicKeyError,
      );
    });
  });

  describe('verifyChallengeSignature', () => {
    const challenge = newChallenge();

    it('accepts the key holder signing the challenge (RSA, wrapped as Android sends it)', () => {
      expect(
        verifyChallengeSignature(
          wrapped(spki(phone.publicKey)),
          challenge,
          wrapped(signed(phone.privateKey, challenge)),
        ),
      ).toBe(true);
    });

    it('accepts an EC P-256 signature', () => {
      expect(
        verifyChallengeSignature(
          spki(iphone.publicKey),
          challenge,
          signed(iphone.privateKey, challenge),
        ),
      ).toBe(true);
    });

    it('refuses a signature from a different key — another phone', () => {
      expect(
        verifyChallengeSignature(
          spki(phone.publicKey),
          challenge,
          signed(rsa(2048).privateKey, challenge),
        ),
      ).toBe(false);
    });

    it('refuses a signature over a different challenge', () => {
      expect(
        verifyChallengeSignature(
          spki(phone.publicKey),
          challenge,
          signed(phone.privateKey, newChallenge()),
        ),
      ).toBe(false);
    });

    it('returns false rather than throwing on garbage', () => {
      expect(verifyChallengeSignature('junk', challenge, 'junk')).toBe(false);
      expect(
        verifyChallengeSignature(spki(phone.publicKey), challenge, '!!!'),
      ).toBe(false);
    });
  });

  it('issues a fresh challenge every time', () => {
    expect(newChallenge()).not.toBe(newChallenge());
  });
});
