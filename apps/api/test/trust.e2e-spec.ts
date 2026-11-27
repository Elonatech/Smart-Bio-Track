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
import { localMoment, toDbDate } from '../src/attendance/attendance-time';

/**
 * Phase 4 M3 — the Trust Score Engine on the real punch path, against a real
 * database with PostGIS.
 *
 * The "office" is in Ibadan; "home" is ~2 km away and "Lagos" ~113 km. Node's
 * crypto plays the phone, as in the device tests. Requests from supertest
 * arrive from 127.0.0.1, which the network tests use as the office range.
 */
describe('Trust score on punches (integration)', () => {
  let ctx: TestContext;

  const OFFICE = { latitude: 7.38, longitude: 3.94 };
  const INSIDE = { latitude: 7.3803, longitude: 3.9401, accuracyMeters: 10 };
  const HOME = { latitude: 7.398, longitude: 3.94, accuracyMeters: 10 };

  type Phone = { publicKey: string; privateKey: KeyObject };
  const newPhone = (): Phone => {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
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

  /**
   * An organisation with one office, and an employee at it who has
   * registered a phone through the API.
   */
  const setUp = async (suffix: string) => {
    const ownerEmail = `trust-owner-${suffix}@test.local`;
    const { accessToken: ownerToken } = await registerOrganization(ctx, {
      organizationName: `Trust ${suffix}`,
      email: ownerEmail,
      adminName: `Owner ${suffix}`,
    });
    const { organizationId } = await ctx.prisma.user.findUniqueOrThrow({
      where: { email: ownerEmail },
    });
    const office = await ctx.prisma.office.create({
      data: { name: 'Ibadan HQ', organizationId, ...OFFICE },
    });

    const email = `trust-emp-${suffix}@test.local`;
    const user = await ctx.prisma.user.create({
      data: {
        employeeId: `EMP-TR-${suffix}`,
        name: `Employee ${suffix}`,
        email,
        role: UserRole.EMPLOYEE,
        status: 'ACTIVE',
        organizationId,
        officeId: office.id,
        passwordHash: await hashPassword('Passw0rd!'),
      },
    });
    const login = await request(httpServer(ctx))
      .post('/api/auth/login')
      .send({ identifier: email, password: 'Passw0rd!' })
      .expect(200);
    const token = (login.body.data as { accessToken: string }).accessToken;

    const phone = newPhone();
    const reg = await api(token)
      .post('/devices/challenges', { purpose: 'REGISTER' })
      .expect(201);
    const device = await api(token)
      .post('/devices', {
        challengeId: reg.body.data.id,
        publicKey: phone.publicKey,
        signature: signWith(phone, reg.body.data.challenge),
        platform: 'ANDROID',
      })
      .expect(201);

    return {
      ownerToken,
      organizationId,
      office,
      user,
      token,
      phone,
      deviceId: device.body.data.id as string,
    };
  };

  /** What the app does: get a code, unlock, sign, send with the location. */
  const phonePunch = async (
    s: { token: string; phone: Phone },
    path: string,
    location: object,
    status: number,
    opts: { signer?: Phone } = {},
  ) => {
    // Takes the expected status: this awaits the challenge first, so it
    // returns a Promise, which has no supertest `.expect` (same lesson as
    // the device tests' register helper).
    const c = await api(s.token)
      .post('/devices/challenges', { purpose: 'ATTENDANCE' })
      .expect(201);
    return api(s.token)
      .post(`/attendance/${path}`, {
        ...location,
        challengeId: c.body.data.id,
        signature: signWith(opts.signer ?? s.phone, c.body.data.challenge),
      })
      .expect(status);
  };

  const addNetwork = (organizationId: string, officeId: string, cidr: string) =>
    ctx.prisma.$executeRaw`
      INSERT INTO "OfficeNetwork" (id, "organizationId", "officeId", cidr, "updatedAt")
      VALUES (gen_random_uuid()::text, ${organizationId}, ${officeId}, ${cidr}::inet, now())
    `;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('approves a verified phone inside the fence, and records the evidence', async () => {
    const s = await setUp('inside');

    const res = await phonePunch(s, 'clock-in', INSIDE, 201);
    expect(res.body.data.punch.decision).toBe('APPROVED');

    const punch = await ctx.prisma.punchEvent.findUniqueOrThrow({
      where: { id: res.body.data.punch.id },
    });
    expect(punch).toMatchObject({
      source: 'MOBILE',
      deviceId: s.deviceId,
      decision: 'APPROVED',
      trustScore: expect.any(Number),
    });
    const reasons = punch.trustReasons as { signal: string; result: string }[];
    expect(reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ signal: 'device', result: 'PASS' }),
        expect.objectContaining({ signal: 'geofence', result: 'PASS' }),
        expect.objectContaining({ signal: 'integrity', result: 'NOT_CHECKED' }),
      ]),
    );
  });

  it('rejects a clock-in from home, keeps the attempt for HR, and says why', async () => {
    const s = await setUp('home');

    const res = await phonePunch(s, 'clock-in', HOME, 403);
    expect(res.body.message).toBe('Clock-in refused.');
    expect(res.body.error.details.join(' ')).toMatch(/Outside the fence/);

    expect(await ctx.prisma.punchEvent.count()).toBe(0);
    const attempt = await ctx.prisma.attendanceAttempt.findFirstOrThrow();
    expect(attempt).toMatchObject({
      userId: s.user.id,
      type: 'CLOCK_IN',
      source: 'MOBILE',
      deviceId: s.deviceId,
    });
    expect(
      await ctx.prisma.auditLog.findFirst({
        where: { action: 'ATTENDANCE_REJECTED', targetId: attempt.id },
      }),
    ).not.toBeNull();
  });

  it('approves from outside the fence when on an office network (EITHER)', async () => {
    const s = await setUp('network');
    await addNetwork(s.organizationId, s.office.id, '127.0.0.0/8');

    const res = await phonePunch(s, 'clock-in', HOME, 201);
    expect(res.body.data.punch.decision).toBe('APPROVED');
  });

  it('under BOTH, rejects inside the fence when off the office network', async () => {
    const s = await setUp('both');
    await addNetwork(s.organizationId, s.office.id, '10.0.0.0/8');
    await ctx.prisma.organization.update({
      where: { id: s.organizationId },
      data: { locationPolicy: 'BOTH' },
    });

    await phonePunch(s, 'clock-in', INSIDE, 403);
  });

  it('flags a clock-in inside the fence with a poor location fix (D2)', async () => {
    const s = await setUp('poorfix');

    const res = await phonePunch(
      s,
      'clock-in',
      {
        ...INSIDE,
        accuracyMeters: 400,
      },
      201,
    );
    expect(res.body.data.punch.decision).toBe('FLAGGED');
  });

  it("rejects a colleague's phone signing for you, and names your phone in the attempt", async () => {
    const s = await setUp('buddy');

    await phonePunch(s, 'clock-in', INSIDE, 403, { signer: newPhone() });
    expect(await ctx.prisma.punchEvent.count()).toBe(0);
    expect(
      (await ctx.prisma.attendanceAttempt.findFirstOrThrow()).deviceId,
    ).toBe(s.deviceId);
  });

  it('refuses a replayed code', async () => {
    const s = await setUp('replay');
    const c = await api(s.token)
      .post('/devices/challenges', { purpose: 'ATTENDANCE' })
      .expect(201);
    const body = {
      ...INSIDE,
      challengeId: c.body.data.id,
      signature: signWith(s.phone, c.body.data.challenge),
    };

    await api(s.token).post('/attendance/clock-in', body).expect(201);
    await api(s.token).post('/attendance/clock-out', body).expect(403);
  });

  it('refuses a code issued before HR reset the phone', async () => {
    const s = await setUp('reset');
    const hr = await ctx.prisma.user.create({
      data: {
        employeeId: 'EMP-TR-HR',
        name: 'HR',
        email: 'trust-hr@test.local',
        role: UserRole.HR_ADMIN,
        status: 'ACTIVE',
        organizationId: s.organizationId,
        passwordHash: await hashPassword('Passw0rd!'),
      },
    });
    const hrLogin = await request(httpServer(ctx))
      .post('/api/auth/login')
      .send({ identifier: hr.email, password: 'Passw0rd!' })
      .expect(200);
    const c = await api(s.token)
      .post('/devices/challenges', { purpose: 'ATTENDANCE' })
      .expect(201);

    await api(hrLogin.body.data.accessToken as string)
      .post(`/devices/${s.deviceId}/revoke`, { reason: 'Lost' })
      .expect(200);

    await api(s.token)
      .post('/attendance/clock-in', {
        ...INSIDE,
        challengeId: c.body.data.id,
        signature: signWith(s.phone, c.body.data.challenge),
      })
      .expect(403);
    // Attributed to the phone the code was issued to, revoked or not.
    expect(
      (await ctx.prisma.attendanceAttempt.findFirstOrThrow()).deviceId,
    ).toBe(s.deviceId);
  });

  it('flags every web punch and never rejects it on location (D14)', async () => {
    const s = await setUp('web');

    const res = await api(s.token)
      .post('/attendance/clock-in', HOME)
      .expect(201);
    expect(res.body.data.punch.decision).toBe('FLAGGED');
    expect(
      await ctx.prisma.punchEvent.findUniqueOrThrow({
        where: { id: res.body.data.punch.id },
      }),
    ).toMatchObject({ source: 'WEB', deviceId: null });
  });

  it("doesn't judge location on clock-out without overtime (D13)", async () => {
    const s = await setUp('out');

    await phonePunch(s, 'clock-in', INSIDE, 201);
    const res = await phonePunch(s, 'clock-out', HOME, 201);
    expect(res.body.data.punch.decision).toBe('APPROVED');
  });

  it('flags a clock-out away from the office that earns overtime (D13)', async () => {
    const s = await setUp('ot');
    // Overtime after 00:01 on every day: any work today is overtime.
    await ctx.prisma.workRule.create({
      data: {
        organizationId: s.organizationId,
        name: 'Tiny day',
        isDefault: true,
        workingDays: [1, 2, 3, 4, 5, 6, 7],
        startMinutes: 0,
        endMinutes: 1,
        overtimeBasis: 'END_TIME',
      },
    });
    // A clock-in 30 minutes ago, written directly (append-only allows
    // inserts) so there is time to count. Fails only if run between 00:00
    // and 00:31 Lagos time, when "30 minutes ago" is yesterday.
    const earlier = new Date(Date.now() - 30 * 60_000);
    await ctx.prisma.punchEvent.create({
      data: {
        organizationId: s.organizationId,
        userId: s.user.id,
        type: 'CLOCK_IN',
        occurredAt: earlier,
        workDate: toDbDate(localMoment(earlier, 'Africa/Lagos').date),
      },
    });

    const res = await phonePunch(s, 'clock-out', HOME, 201);
    expect(res.body.data.summary.overtimeMinutes).toBeGreaterThan(0);
    expect(res.body.data.punch.decision).toBe('FLAGGED');
  });

  it('turns away a made-up code from someone with no phone, without recording it', async () => {
    const s = await setUp('nophone');
    await api(s.token).get('/devices/me').expect(200);
    await ctx.prisma.device.update({
      where: { id: s.deviceId },
      data: { revokedAt: new Date(), revokedById: s.user.id },
    });

    await api(s.token)
      .post('/attendance/clock-in', {
        ...INSIDE,
        challengeId: '00000000-0000-4000-8000-000000000000',
        signature: 'x',
      })
      .expect(400);
    expect(await ctx.prisma.attendanceAttempt.count()).toBe(0);
  });

  it('refuses half a phone punch (a code without a signature)', async () => {
    const s = await setUp('half');

    await api(s.token)
      .post('/attendance/clock-in', {
        ...INSIDE,
        challengeId: '00000000-0000-4000-8000-000000000000',
      })
      .expect(400);
  });
});
