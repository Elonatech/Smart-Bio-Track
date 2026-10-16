import request from 'supertest';
import {
  createTestApp,
  httpServer,
  registerOrganization,
  TestContext,
} from './helpers/test-app';
import { localMoment } from '../src/attendance/attendance-time';
import { hashPassword } from '../src/common/password.util';

/**
 * Phase 3 M3 — the punch API against a real database.
 *
 * Everything here is something the unit tests cannot see by construction:
 * whether the routes are mounted at all (the first version of this module was
 * never registered in AppModule), the row lock under concurrent requests,
 * tenant isolation, the append-only trigger, the audit write, and the real
 * shape of the responses.
 */
describe('Attendance (integration)', () => {
  let ctx: TestContext;

  const signUp = async (suffix: string) => {
    const { accessToken } = await registerOrganization(ctx, {
      organizationName: `Attend ${suffix}`,
      email: `attend-${suffix}@test.local`,
      adminName: `Person ${suffix}`,
    });
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { email: `attend-${suffix}@test.local` },
    });
    return { token: accessToken, user };
  };

  const punch = (token: string, action: string, body: object = {}) =>
    request(httpServer(ctx))
      .post(`/api/attendance/${action}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const get = (token: string, path: string) =>
    request(httpServer(ctx))
      .get(`/api/attendance/${path}`)
      .set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('the routes exist and are protected', () => {
    it.each(['clock-in', 'clock-out', 'break-start', 'break-end'])(
      'POST %s refuses an anonymous caller with 401, not 404',
      async (action) => {
        // 404 would mean the module is not registered — the original fault.
        await request(httpServer(ctx))
          .post(`/api/attendance/${action}`)
          .expect(401);
      },
    );

    it.each(['today', 'history'])(
      'GET %s refuses an anonymous caller with 401',
      async (path) => {
        await request(httpServer(ctx))
          .get(`/api/attendance/${path}`)
          .expect(401);
      },
    );
  });

  describe('a working day', () => {
    it('clocks in, takes a break, clocks out — and the summary follows', async () => {
      const { token } = await signUp('day');

      const inRes = await punch(token, 'clock-in').expect(201);
      expect(inRes.body.data.state).toBe('CLOCKED_IN');
      expect(inRes.body.data.summary.status).toBe('PRESENT');

      // The day is the ORGANISATION's day (Africa/Lagos by default), not UTC's.
      const lagosToday = localMoment(
        new Date(inRes.body.data.punch.occurredAt as string),
        'Africa/Lagos',
      ).date;
      expect(inRes.body.data.summary.workDate).toBe(lagosToday);

      expect(
        (await punch(token, 'break-start').expect(201)).body.data.state,
      ).toBe('ON_BREAK');
      expect(
        (await punch(token, 'break-end').expect(201)).body.data.state,
      ).toBe('CLOCKED_IN');
      expect(
        (await punch(token, 'clock-out').expect(201)).body.data.state,
      ).toBe('CLOCKED_OUT');

      const today = await get(token, 'today').expect(200);
      expect(today.body.data).toMatchObject({
        workDate: lagosToday,
        timeZone: 'Africa/Lagos',
        state: 'CLOCKED_OUT',
      });
      expect(
        today.body.data.punches.map((p: { type: string }) => p.type),
      ).toEqual(['CLOCK_IN', 'BREAK_START', 'BREAK_END', 'CLOCK_OUT']);
      expect(today.body.data.summary.lastClockOut).not.toBeNull();
    });

    it('creates the summary on the FIRST punch of the day', async () => {
      // The original version updated a summary that did not exist yet, so the
      // first clock-in of every day errored — after saving the punch.
      const { token, user } = await signUp('first');
      await punch(token, 'clock-in').expect(201);
      expect(
        await ctx.prisma.attendanceSummary.count({
          where: { userId: user.id },
        }),
      ).toBe(1);
    });

    it('allows a second session the same day', async () => {
      const { token } = await signUp('again');
      await punch(token, 'clock-in').expect(201);
      await punch(token, 'clock-out').expect(201);
      const back = await punch(token, 'clock-in').expect(201);
      expect(back.body.data.state).toBe('CLOCKED_IN');
    });
  });

  describe('refuses punches that make no sense', () => {
    it.each([
      ['clock-out', 'before clocking in'],
      ['break-start', 'before clocking in'],
      ['break-end', 'without a break'],
    ])('%s %s → 409', async (action) => {
      const { token } = await signUp(`bad-${action}`);
      await punch(token, action).expect(409);
    });

    it('a second clock-in while clocked in → 409, and no second punch', async () => {
      const { token, user } = await signUp('twice');
      await punch(token, 'clock-in').expect(201);
      await punch(token, 'clock-in').expect(409);
      expect(
        await ctx.prisma.punchEvent.count({ where: { userId: user.id } }),
      ).toBe(1);
    });
  });

  describe('concurrency', () => {
    it('two simultaneous clock-ins record exactly one', async () => {
      // A double tap, or two tabs. Without the row lock both requests read
      // "not clocked in", both pass the check, and both insert.
      const { token, user } = await signUp('race');

      const results = await Promise.all([
        punch(token, 'clock-in'),
        punch(token, 'clock-in'),
      ]);
      const statuses = results.map((r) => r.status).sort();

      expect(statuses).toEqual([201, 409]);
      expect(
        await ctx.prisma.punchEvent.count({ where: { userId: user.id } }),
      ).toBe(1);
    });
  });

  describe('tenant isolation', () => {
    it("one company's punches are invisible to another", async () => {
      const a = await signUp('tenant-a');
      const b = await signUp('tenant-b');

      await punch(a.token, 'clock-in').expect(201);

      const bToday = await get(b.token, 'today').expect(200);
      expect(bToday.body.data.punches).toEqual([]);
      expect(bToday.body.data.summary).toBeNull();
      expect(bToday.body.data.state).toBe('NOT_STARTED');

      const bHistory = await get(b.token, 'history').expect(200);
      expect(bHistory.body.data.days).toEqual([]);

      // And B can clock in independently — A's state is not B's.
      await punch(b.token, 'clock-in').expect(201);
    });

    it("one colleague's punches are invisible to another in the SAME company", async () => {
      // The test above alone is not enough. With the original fault — the
      // controller reading `req.user.userId`, which no longer exists — Prisma
      // drops `userId: undefined` from the filter, and the organisation filter
      // still keeps other companies out. So the cross-company test passes
      // while every employee sees every colleague's punches. Verified: the
      // fault reintroduced passes the test above and fails this one.
      const admin = await signUp('colleague');
      const colleagueEmail = 'colleague-two@test.local';
      await ctx.prisma.user.create({
        data: {
          employeeId: 'EMP-COLLEAGUE-2',
          name: 'Second Colleague',
          email: colleagueEmail,
          role: 'EMPLOYEE',
          status: 'ACTIVE',
          organizationId: admin.user.organizationId,
          passwordHash: await hashPassword('Passw0rd!'),
        },
      });
      const login = await request(httpServer(ctx))
        .post('/api/auth/login')
        .send({ identifier: colleagueEmail, password: 'Passw0rd!' })
        .expect(200);
      const colleagueToken = (login.body.data as { accessToken: string })
        .accessToken;

      await punch(admin.token, 'clock-in').expect(201);

      const theirs = await get(colleagueToken, 'today').expect(200);
      expect(theirs.body.data.punches).toEqual([]);
      expect(theirs.body.data.state).toBe('NOT_STARTED');
      await punch(colleagueToken, 'clock-in').expect(201);
    });
  });

  describe('location (recorded, not enforced — decision 6)', () => {
    it('stores the position sent with a punch', async () => {
      const { token, user } = await signUp('loc');
      await punch(token, 'clock-in', {
        latitude: 6.5244,
        longitude: 3.3792,
        accuracyMeters: 12,
      }).expect(201);

      const stored = await ctx.prisma.punchEvent.findFirstOrThrow({
        where: { userId: user.id },
      });
      expect(stored).toMatchObject({
        latitude: 6.5244,
        longitude: 3.3792,
        accuracyMeters: 12,
      });
    });

    it('clocks in without a position — the browser may refuse to share one', async () => {
      const { token } = await signUp('noloc');
      await punch(token, 'clock-in').expect(201);
    });

    it.each([
      ['an impossible latitude', { latitude: 200, longitude: 3.3 }],
      ['latitude without longitude', { latitude: 6.5 }],
      [
        'a negative accuracy',
        { latitude: 6.5, longitude: 3.3, accuracyMeters: -1 },
      ],
      [
        'an unknown field',
        { latitude: 6.5, longitude: 3.3, timestamp: '2020-01-01T00:00:00Z' },
      ],
    ])('rejects %s with 400', async (_label, body) => {
      // The last case matters most: a client must never be able to supply the
      // time. forbidNonWhitelisted turns the attempt into an error rather than
      // silently ignoring it.
      const { token } = await signUp(`loc400-${_label.length}`);
      await punch(token, 'clock-in', body).expect(400);
    });
  });

  describe('lateness uses the configured rule', () => {
    it('measures from start + grace, in local time', async () => {
      const { token, user } = await signUp('late');

      // Start 00:00, no grace, every day: lateness is then exactly the local
      // minute of the clock-in, which makes the expectation exact whatever
      // time the suite runs.
      const rule = await ctx.prisma.workRule.create({
        data: {
          organizationId: user.organizationId,
          name: 'Midnight start',
          isDefault: true,
          workingDays: [1, 2, 3, 4, 5, 6, 7],
          startMinutes: 0,
          endMinutes: 1440,
          gracePeriodMinutes: 0,
        },
      });

      const res = await punch(token, 'clock-in').expect(201);
      const { summary } = res.body.data;
      const expected = localMoment(
        new Date(summary.firstClockIn as string),
        'Africa/Lagos',
      ).minutes;

      expect(summary.lateMinutes).toBe(expected);
      expect(summary.isLate).toBe(expected > 0);
      expect(summary.scheduledStartMinutes).toBe(0);

      const stored = await ctx.prisma.attendanceSummary.findFirstOrThrow({
        where: { userId: user.id },
      });
      expect(stored.workRuleId).toBe(rule.id);
    });

    it('is never late when no rule is configured', async () => {
      const { token } = await signUp('norule');
      const res = await punch(token, 'clock-in').expect(201);
      expect(res.body.data.summary).toMatchObject({
        isLate: false,
        lateMinutes: 0,
        scheduledStartMinutes: null,
      });
    });
  });

  describe('the record', () => {
    it('audits every punch, pointing at the punch itself', async () => {
      const { token, user } = await signUp('audit');
      const res = await punch(token, 'clock-in').expect(201);

      const entry = await ctx.prisma.auditLog.findFirstOrThrow({
        where: { action: 'CLOCK_IN' },
      });
      expect(entry).toMatchObject({
        organizationId: user.organizationId,
        actorId: user.id,
        targetType: 'PunchEvent',
        targetId: res.body.data.punch.id,
      });
    });

    it('cannot be edited or deleted, even by the application itself', async () => {
      // The trigger, not the absence of an update route, is the guarantee.
      const { token, user } = await signUp('immutable');
      await punch(token, 'clock-in').expect(201);
      const p = await ctx.prisma.punchEvent.findFirstOrThrow({
        where: { userId: user.id },
      });

      await expect(
        ctx.prisma.punchEvent.update({
          where: { id: p.id },
          data: { occurredAt: new Date(0) },
        }),
      ).rejects.toThrow(/append-only/);
      await expect(
        ctx.prisma.punchEvent.delete({ where: { id: p.id } }),
      ).rejects.toThrow(/append-only/);
    });
  });

  describe('history', () => {
    it("returns today's summary in the default range", async () => {
      const { token } = await signUp('hist');
      const inRes = await punch(token, 'clock-in').expect(201);

      const res = await get(token, 'history').expect(200);
      expect(res.body.data.days).toHaveLength(1);
      expect(res.body.data.days[0].workDate).toBe(
        inRes.body.data.summary.workDate,
      );
      expect(res.body.data.to).toBe(inRes.body.data.summary.workDate);
    });

    it.each([
      ['a malformed date', 'from=14-10-2026'],
      ['a date that does not exist', 'from=2026-02-31'],
      ['from after to', 'from=2026-10-10&to=2026-10-01'],
      ['a range over 93 days', 'from=2026-01-01&to=2026-12-31'],
    ])('rejects %s with 400', async (_label, qs) => {
      const { token } = await signUp(`h400-${qs.length}`);
      await get(token, `history?${qs}`).expect(400);
    });
  });
});
