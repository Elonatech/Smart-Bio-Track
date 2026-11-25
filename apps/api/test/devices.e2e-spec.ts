import request from 'supertest';
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { UserRole } from '@prisma/client';
import {
  createTestApp,
  httpServer,
  registerOrganization,
  TestContext,
} from './helpers/test-app';
import { hashPassword } from '../src/common/password.util';

/**
 * Phase 4 M2 — registering a phone, against a real database.
 *
 * Node's crypto stands in for the phone: it makes the same kind of key the
 * Android Keystore made in the 25 Nov trial (RSA-2048, signing SHA256withRSA)
 * and the iPhone Secure Enclave makes (EC P-256), and signs the challenge the
 * way the app does — the challenge string itself, as UTF-8.
 */
describe('Devices (integration)', () => {
  let ctx: TestContext;

  type Phone = { publicKey: string; privateKey: KeyObject };
  const newPhone = (kind: 'rsa' | 'ec' = 'rsa', rsaBits = 2048): Phone => {
    const pair =
      kind === 'rsa'
        ? generateKeyPairSync('rsa', { modulusLength: rsaBits })
        : generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    return {
      publicKey: pair.publicKey
        .export({ type: 'spki', format: 'der' })
        .toString('base64'),
      privateKey: pair.privateKey,
    };
  };
  const signWith = (phone: Phone, challenge: string) =>
    sign('sha256', Buffer.from(challenge, 'utf8'), phone.privateKey).toString(
      'base64',
    );

  /** A new organisation; its first user is the Organization Owner. */
  const signUp = async (suffix: string) => {
    // "owner-" so it can't collide with colleague(…, suffix) in the same test.
    const email = `dev-owner-${suffix}@test.local`;
    const { accessToken } = await registerOrganization(ctx, {
      organizationName: `Devices ${suffix}`,
      email,
      adminName: `Owner ${suffix}`,
    });
    const owner = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
    return { ownerToken: accessToken, organizationId: owner.organizationId };
  };

  /** A signed-in colleague with a given role, in an existing organisation. */
  const colleague = async (
    organizationId: string,
    role: UserRole,
    suffix: string,
  ) => {
    const email = `dev-${suffix}@test.local`;
    const user = await ctx.prisma.user.create({
      data: {
        employeeId: `EMP-DEV-${suffix}`,
        name: `Colleague ${suffix}`,
        email,
        role,
        status: 'ACTIVE',
        organizationId,
        passwordHash: await hashPassword('Passw0rd!'),
      },
    });
    const res = await request(httpServer(ctx))
      .post('/api/auth/login')
      .send({ identifier: email, password: 'Passw0rd!' })
      .expect(200);
    return {
      token: (res.body.data as { accessToken: string }).accessToken,
      id: user.id,
    };
  };

  const api = (token: string) => ({
    get: (path: string) =>
      request(httpServer(ctx))
        .get(`/api${path}`)
        .set('Authorization', `Bearer ${token}`),
    post: (path: string, body: object = {}) =>
      request(httpServer(ctx))
        .post(`/api${path}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body),
  });

  const challenge = async (token: string, purpose = 'REGISTER') => {
    const res = await api(token)
      .post('/devices/challenges', { purpose })
      .expect(201);
    return res.body.data as {
      id: string;
      challenge: string;
      expiresAt: string;
    };
  };

  /**
   * The whole path: get a code, sign it, register. Takes the expected status
   * rather than returning the request: it has to await the challenge first, so
   * what it returns is a Promise, which has no supertest `.expect`.
   */
  const register = async (token: string, phone = newPhone(), status = 201) => {
    const c = await challenge(token);
    return api(token)
      .post('/devices', {
        challengeId: c.id,
        publicKey: phone.publicKey,
        signature: signWith(phone, c.challenge),
        platform: 'ANDROID',
        label: 'Test phone',
      })
      .expect(status);
  };

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('registering a phone', () => {
    it('registers the phone that signed the code, and records it', async () => {
      const { organizationId } = await signUp('happy');
      const emp = await colleague(organizationId, UserRole.EMPLOYEE, 'happy');

      const res = await register(emp.token);
      expect(res.body.data).toMatchObject({
        platform: 'ANDROID',
        label: 'Test phone',
        keyAlgorithm: 'RSA_2048_SHA256',
        revokedAt: null,
      });
      // The public key isn't sent back — nothing needs it but the server.
      expect(res.body.data).not.toHaveProperty('publicKey');

      const mine = await api(emp.token).get('/devices/me').expect(200);
      expect(mine.body.data.id).toBe(res.body.data.id);

      const audit = await ctx.prisma.auditLog.findFirst({
        where: { action: 'DEVICE_REGISTERED', targetId: res.body.data.id },
      });
      expect(audit).toMatchObject({
        actorId: emp.id,
        targetType: 'Device',
        targetLabel: 'Colleague happy: Test phone',
      });
    });

    it('accepts an iPhone-style EC P-256 key', async () => {
      const { organizationId } = await signUp('ec');
      const emp = await colleague(organizationId, UserRole.EMPLOYEE, 'ec');

      const res = await register(emp.token, newPhone('ec'));
      expect(res.body.data.keyAlgorithm).toBe('EC_P256_SHA256');
    });

    it('lets HR managers and team leads register — they clock in too', async () => {
      const { organizationId } = await signUp('staff');
      const hr = await colleague(organizationId, UserRole.HR_ADMIN, 'staff-hr');
      const lead = await colleague(
        organizationId,
        UserRole.TEAM_LEAD,
        'staff-tl',
      );

      await register(hr.token);
      await register(lead.token);
    });

    it('refuses Organization Owners, who are exempt from attendance', async () => {
      const { ownerToken } = await signUp('owner');

      await api(ownerToken)
        .post('/devices/challenges', { purpose: 'REGISTER' })
        .expect(403);
    });

    it('refuses a code signed by a different key, and spends the code anyway', async () => {
      const { organizationId } = await signUp('wrongkey');
      const emp = await colleague(
        organizationId,
        UserRole.EMPLOYEE,
        'wrongkey',
      );
      const phone = newPhone();
      const c = await challenge(emp.token);

      await api(emp.token)
        .post('/devices', {
          challengeId: c.id,
          publicKey: phone.publicKey,
          signature: signWith(newPhone(), c.challenge),
          platform: 'ANDROID',
        })
        .expect(400);

      // The correct signature on the same code is now refused too: a failed
      // attempt must not leave the code open for another try.
      await api(emp.token)
        .post('/devices', {
          challengeId: c.id,
          publicKey: phone.publicKey,
          signature: signWith(phone, c.challenge),
          platform: 'ANDROID',
        })
        .expect(400);
      expect(await ctx.prisma.device.count()).toBe(0);
    });

    it('refuses a code used twice (replay)', async () => {
      const { organizationId } = await signUp('replay');
      const emp = await colleague(organizationId, UserRole.EMPLOYEE, 'replay');
      const phone = newPhone();
      const c = await challenge(emp.token);
      const body = {
        challengeId: c.id,
        publicKey: phone.publicKey,
        signature: signWith(phone, c.challenge),
        platform: 'ANDROID',
      };

      await api(emp.token).post('/devices', body).expect(201);
      await api(emp.token).post('/devices', body).expect(400);
    });

    it('refuses an expired code', async () => {
      const { organizationId } = await signUp('expired');
      const emp = await colleague(organizationId, UserRole.EMPLOYEE, 'expired');
      const phone = newPhone();
      // Written directly: the single-use trigger forbids moving an existing
      // code's expiry, which is exactly the point.
      const old = await ctx.prisma.deviceChallenge.create({
        data: {
          userId: emp.id,
          purpose: 'REGISTER',
          challenge: 'expired-code',
          createdAt: new Date(Date.now() - 10 * 60_000),
          expiresAt: new Date(Date.now() - 5 * 60_000),
        },
      });

      await api(emp.token)
        .post('/devices', {
          challengeId: old.id,
          publicKey: phone.publicKey,
          signature: signWith(phone, old.challenge),
          platform: 'ANDROID',
        })
        .expect(400);
    });

    it("refuses a colleague's code", async () => {
      const { organizationId } = await signUp('theirs');
      const a = await colleague(organizationId, UserRole.EMPLOYEE, 'theirs-a');
      const b = await colleague(organizationId, UserRole.EMPLOYEE, 'theirs-b');
      const phone = newPhone();
      const cOfA = await challenge(a.token);

      await api(b.token)
        .post('/devices', {
          challengeId: cOfA.id,
          publicKey: phone.publicKey,
          signature: signWith(phone, cOfA.challenge),
          platform: 'ANDROID',
        })
        .expect(400);
    });

    it('refuses a weak key (RSA-1024)', async () => {
      const { organizationId } = await signUp('weak');
      const emp = await colleague(organizationId, UserRole.EMPLOYEE, 'weak');

      await register(emp.token, newPhone('rsa', 1024), 400);
    });

    it('allows one active phone per employee (D4)', async () => {
      const { organizationId } = await signUp('second');
      const emp = await colleague(organizationId, UserRole.EMPLOYEE, 'second');

      await register(emp.token);
      const res = await register(emp.token, newPhone(), 409);
      expect(res.body.message).toMatch(/ask HR to reset/i);
    });

    it('refuses a public key already registered to someone else', async () => {
      const { organizationId } = await signUp('samekey');
      const a = await colleague(organizationId, UserRole.EMPLOYEE, 'samekey-a');
      const b = await colleague(organizationId, UserRole.EMPLOYEE, 'samekey-b');
      const phone = newPhone();

      await register(a.token, phone);
      await register(b.token, phone, 409);
    });
  });

  describe('attendance challenges', () => {
    it('needs a registered phone, and names it', async () => {
      const { organizationId } = await signUp('att');
      const emp = await colleague(organizationId, UserRole.EMPLOYEE, 'att');

      await api(emp.token)
        .post('/devices/challenges', { purpose: 'ATTENDANCE' })
        .expect(400);

      const device = (await register(emp.token)).body.data;
      const c = await challenge(emp.token, 'ATTENDANCE');
      const row = await ctx.prisma.deviceChallenge.findUniqueOrThrow({
        where: { id: c.id },
      });
      expect(row.deviceId).toBe(device.id);
    });
  });

  describe('HR resetting a phone', () => {
    it('revokes it with a reason, logs it, and lets the employee register again', async () => {
      const { organizationId } = await signUp('reset');
      const hr = await colleague(organizationId, UserRole.HR_ADMIN, 'reset-hr');
      const emp = await colleague(organizationId, UserRole.EMPLOYEE, 'reset');
      const device = (await register(emp.token)).body.data;

      const res = await api(hr.token)
        .post(`/devices/${device.id}/revoke`, { reason: 'Lost phone' })
        .expect(200);
      expect(res.body.data).toMatchObject({ revokeReason: 'Lost phone' });
      expect(res.body.data.revokedAt).not.toBeNull();

      expect(
        await ctx.prisma.auditLog.findFirst({
          where: { action: 'DEVICE_REVOKED', targetId: device.id },
        }),
      ).toMatchObject({
        actorId: hr.id,
        targetLabel: 'Colleague reset: Test phone (Lost phone)',
      });

      await api(emp.token)
        .get('/devices/me')
        .expect(200)
        .expect((r) => {
          expect(r.body.data).toBeNull();
        });
      await register(emp.token);

      // History keeps both; the revoked one is still there.
      const list = await api(hr.token)
        .get(`/devices?userId=${emp.id}`)
        .expect(200);
      expect(list.body.data).toHaveLength(2);
    });

    it('refuses to revoke the same phone twice', async () => {
      const { organizationId } = await signUp('twice');
      const hr = await colleague(organizationId, UserRole.HR_ADMIN, 'twice-hr');
      const emp = await colleague(organizationId, UserRole.EMPLOYEE, 'twice');
      const device = (await register(emp.token)).body.data;

      await api(hr.token)
        .post(`/devices/${device.id}/revoke`, { reason: 'Lost' })
        .expect(200);
      await api(hr.token)
        .post(`/devices/${device.id}/revoke`, { reason: 'Lost' })
        .expect(409);
    });

    it("refuses employees and team leads — they can't reset phones", async () => {
      const { organizationId } = await signUp('noreset');
      const lead = await colleague(
        organizationId,
        UserRole.TEAM_LEAD,
        'noreset-tl',
      );
      const emp = await colleague(organizationId, UserRole.EMPLOYEE, 'noreset');
      const device = (await register(emp.token)).body.data;

      await api(emp.token)
        .post(`/devices/${device.id}/revoke`, { reason: 'x' })
        .expect(403);
      await api(lead.token)
        .post(`/devices/${device.id}/revoke`, { reason: 'x' })
        .expect(403);
      await api(emp.token).get(`/devices?userId=${emp.id}`).expect(403);
    });

    it("lets only the Owner reset an HR Manager's phone", async () => {
      const { organizationId, ownerToken } = await signUp('hrphone');
      const hr1 = await colleague(
        organizationId,
        UserRole.HR_ADMIN,
        'hrphone-1',
      );
      const hr2 = await colleague(
        organizationId,
        UserRole.HR_ADMIN,
        'hrphone-2',
      );
      const device = (await register(hr2.token)).body.data;

      await api(hr1.token)
        .post(`/devices/${device.id}/revoke`, { reason: 'x' })
        .expect(403);
      await api(ownerToken)
        .post(`/devices/${device.id}/revoke`, { reason: 'Replaced' })
        .expect(200);
    });

    it("can't see or reset another company's phones", async () => {
      const a = await signUp('orga');
      const b = await signUp('orgb');
      const empA = await colleague(a.organizationId, UserRole.EMPLOYEE, 'orga');
      const hrB = await colleague(
        b.organizationId,
        UserRole.HR_ADMIN,
        'orgb-hr',
      );
      const device = (await register(empA.token)).body.data;

      await api(hrB.token)
        .post(`/devices/${device.id}/revoke`, { reason: 'x' })
        .expect(404);
      await api(hrB.token).get(`/devices?userId=${empA.id}`).expect(404);
    });
  });
});
