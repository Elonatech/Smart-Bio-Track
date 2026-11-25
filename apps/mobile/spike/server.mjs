// Phase 4 M2 trial: the server half of "the phone proves it is the phone".
//
// Run on a laptop on the same Wi-Fi as the phone:  node spike/server.mjs
// Plain Node, no installs. Nothing here is production code — M3 rebuilds
// this inside the API with a database, per-user devices and audit entries.
//
// What it checks, mirroring the plan (§4):
//   - a challenge is single-use and expires after 2 minutes (replay);
//   - the signature must verify against the public key registered for the
//     device, so a different key — another phone — is refused.

import { createServer } from 'node:http';
import { createPublicKey, randomBytes, randomUUID, verify } from 'node:crypto';
import { networkInterfaces } from 'node:os';

const PORT = 8787;
const CHALLENGE_TTL_MS = 2 * 60 * 1000;

let registeredKey = null; // one device, as in decision D4
const challenges = new Map(); // id -> { challenge, expiresAt, used }

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
  console.log(`  -> ${status} ${JSON.stringify(body)}`);
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

// The library returns the key as base64 DER (X.509 SubjectPublicKeyInfo),
// wrapped with newlines by Android's Base64.DEFAULT — hence the strip.
function toKey(base64) {
  return createPublicKey({
    key: Buffer.from(base64.replace(/\s+/g, ''), 'base64'),
    format: 'der',
    type: 'spki',
  });
}

const routes = {
  'POST /register': async (req, res) => {
    const { publicKey } = await readJson(req);
    try {
      registeredKey = toKey(publicKey);
    } catch (e) {
      return send(res, 400, { ok: false, reason: `not a public key: ${e.message}` });
    }
    const { modulusLength } = registeredKey.asymmetricKeyDetails ?? {};
    send(res, 200, { ok: true, keyType: registeredKey.asymmetricKeyType, modulusLength });
  },

  'GET /challenge': async (_req, res) => {
    const id = randomUUID();
    const challenge = randomBytes(32).toString('base64');
    challenges.set(id, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS, used: false });
    send(res, 200, { id, challenge });
  },

  'POST /verify': async (req, res) => {
    const { id, signature } = await readJson(req);
    const entry = challenges.get(id);
    if (!registeredKey) return send(res, 400, { ok: false, reason: 'no device registered' });
    if (!entry) return send(res, 400, { ok: false, reason: 'unknown challenge' });
    if (entry.used) return send(res, 409, { ok: false, reason: 'challenge already used (replay)' });
    if (Date.now() > entry.expiresAt) return send(res, 410, { ok: false, reason: 'challenge expired' });

    // Spent before the signature is checked, so a failed attempt can't be
    // retried against the same challenge either.
    entry.used = true;

    const valid = verify(
      'sha256',
      Buffer.from(entry.challenge, 'utf8'),
      registeredKey,
      Buffer.from(String(signature).replace(/\s+/g, ''), 'base64'),
    );
    send(res, valid ? 200 : 401, valid ? { ok: true } : { ok: false, reason: 'signature does not match the registered key' });
  },
};

createServer(async (req, res) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  const handler = routes[`${req.method} ${req.url}`];
  if (!handler) return send(res, 404, { ok: false, reason: 'no such route' });
  try {
    await handler(req, res);
  } catch (e) {
    send(res, 500, { ok: false, reason: e.message });
  }
}).listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
  console.log(`Trial server on port ${PORT}. Put one of these in the app:`);
  for (const ip of ips) console.log(`  http://${ip}:${PORT}`);
});
