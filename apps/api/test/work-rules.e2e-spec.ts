import request from 'supertest';
import { UserRole } from '@prisma/client';
import {
  createTestApp,
  httpServer,
  registerOrganization,
  TestContext,
} from './helpers/test-app';
import { localMoment } from '../src/attendance/attendance-time';
import { hashPassword } from '../src/common/password.util';

/**
 * Phase 3 M2 — working-hours rules, holidays and the organisation's timezone,
 * against a real database, and how each one feeds the punch summary.
 */
describe('Work rules, holidays and organisation settings (integration)', () => {
  let ctx: TestContext;

  const signUp = async (suffix: string) => {
    const email = `m2-${suffix}@test.local`;
    const { accessToken } = await registerOrganization(ctx, {
      organizationName: `M2 ${suffix}`,
      email,
      adminName: `Admin ${suffix}`,
    });
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
    return { token: accessToken, user, organizationId: user.organizationId };
  };

  /** A signed-in colleague with a given role, in an existing organisation. */
  const colleague = async (
    organizationId: string,
    role: UserRole,
    suffix: string,
    officeId?: string,
  ) => {
    const email = `m2-${suffix}@test.local`;
    await ctx.prisma.user.create({
      data: {
        employeeId: `EMP-M2-${suffix}`,
        name: `Colleague ${suffix}`,
        email,
        role,
        status: 'ACTIVE',
        organizationId,
        officeId,
        passwordHash: await hashPassword('Passw0rd!'),
      },
    });
    const res = await request(httpServer(ctx))
      .post('/api/auth/login')
      .send({ identifier: email, password: 'Passw0rd!' })
      .expect(200);
    return (res.body.data as { accessToken: string }).accessToken;
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
    patch: (path: string, body: object) =>
      request(httpServer(ctx))
        .patch(`/api${path}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body),
    put: (path: string, body: object) =>
      request(httpServer(ctx))
        .put(`/api${path}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body),
    delete: (path: string) =>
      request(httpServer(ctx))
        .delete(`/api${path}`)
        .set('Authorization', `Bearer ${token}`),
  });

  const STANDARD = {
    name: 'Standard',
    workingDays: [1, 2, 3, 4, 5],
    startTime: '08:00',
    endTime: '17:00',
    gracePeriodMinutes: 10,
    overtimeAfterMinutes: 480,
  };

  /** Every day, starting at midnight, no grace: lateness = minute of arrival. */
  const MIDNIGHT = {
    name: 'Midnight',
    workingDays: [1, 2, 3, 4, 5, 6, 7],
    startTime: '00:00',
    endTime: '23:59',
    gracePeriodMinutes: 0,
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

  describe('work rules', () => {
    it('stores times as typed and returns them the same way', async () => {
      const { token, organizationId } = await signUp('times');
      const res = await api(token).post('/work-rules', STANDARD).expect(201);

      expect(res.body.data).toMatchObject({
        name: 'Standard',
        startTime: '08:00',
        endTime: '17:00',
        gracePeriodMinutes: 10,
        overtimeAfterMinutes: 480,
        overtimeMultiplier: 1.5,
        workingDays: [1, 2, 3, 4, 5],
      });
      // …and as minutes underneath, which is what the database checks.
      const row = await ctx.prisma.workRule.findFirstOrThrow({
        where: { organizationId },
      });
      expect([row.startMinutes, row.endMinutes]).toEqual([480, 1020]);
    });

    it('makes the first rule the default, whatever the request says', async () => {
      const { token } = await signUp('first');
      const res = await api(token)
        .post('/work-rules', { ...STANDARD, isDefault: false })
        .expect(201);
      expect(res.body.data.isDefault).toBe(true);
    });

    it('moves the default rather than allowing two', async () => {
      const { token, organizationId } = await signUp('move');
      await api(token).post('/work-rules', STANDARD).expect(201);
      const second = await api(token)
        .post('/work-rules', {
          ...STANDARD,
          name: 'Late shift',
          isDefault: true,
        })
        .expect(201);

      const defaults = await ctx.prisma.workRule.findMany({
        where: { organizationId, isDefault: true },
      });
      expect(defaults.map((r) => r.id)).toEqual([second.body.data.id]);
    });

    it('refuses to un-default the default — another must take its place', async () => {
      const { token } = await signUp('undefault');
      const rule = await api(token).post('/work-rules', STANDARD).expect(201);
      await api(token)
        .patch(`/work-rules/${rule.body.data.id}`, { isDefault: false })
        .expect(400);
    });

    it.each([
      ['an overnight shift', { startTime: '22:00', endTime: '06:00' }],
      ['equal start and end', { startTime: '08:00', endTime: '08:00' }],
      ['a malformed time', { startTime: '8am' }],
      ['weekday 8', { workingDays: [1, 8] }],
      ['no working days', { workingDays: [] }],
      ['repeated days', { workingDays: [1, 1] }],
      ['a multiplier below 1', { overtimeMultiplier: 0.5 }],
    ])('rejects %s with 400', async (_label, override) => {
      const { token } = await signUp(`bad-${_label.length}`);
      const res = await api(token)
        .post('/work-rules', { ...STANDARD, ...override })
        .expect(400);
      if (_label === 'an overnight shift') {
        // Decision 5, explained rather than surfacing as a database error.
        expect(JSON.stringify(res.body)).toMatch(/Overnight shifts/);
      }
    });

    it('validates the resulting PAIR when only one time is changed', async () => {
      // Moving just the end to before the stored start is as much an
      // overnight shift as sending both.
      const { token } = await signUp('pair');
      const rule = await api(token).post('/work-rules', STANDARD).expect(201);
      await api(token)
        .patch(`/work-rules/${rule.body.data.id}`, { endTime: '07:00' })
        .expect(400);
    });

    it('refuses a duplicate name with 409', async () => {
      const { token } = await signUp('dup');
      await api(token).post('/work-rules', STANDARD).expect(201);
      await api(token).post('/work-rules', STANDARD).expect(409);
    });

    it('will not delete the default while other rules exist', async () => {
      const { token } = await signUp('deldefault');
      const first = await api(token).post('/work-rules', STANDARD).expect(201);
      await api(token)
        .post('/work-rules', { ...STANDARD, name: 'Other' })
        .expect(201);
      await api(token).delete(`/work-rules/${first.body.data.id}`).expect(400);
    });

    it('deleting a rule drops its offices back to the default', async () => {
      const { token } = await signUp('fallback');
      await api(token).post('/work-rules', STANDARD).expect(201);
      const other = await api(token)
        .post('/work-rules', { ...STANDARD, name: 'Other' })
        .expect(201);
      const office = await api(token)
        .post('/offices', { name: 'HQ Lagos', latitude: 6.5, longitude: 3.4 })
        .expect(201);

      await api(token)
        .put(`/offices/${office.body.data.id}`, {
          workRuleId: other.body.data.id,
        })
        .expect(200);
      await api(token).delete(`/work-rules/${other.body.data.id}`).expect(204);

      const after = await ctx.prisma.office.findUniqueOrThrow({
        where: { id: office.body.data.id as string },
      });
      expect(after.workRuleId).toBeNull();
    });

    it('lets an employee read the rules but not change them', async () => {
      const { token, organizationId } = await signUp('roles');
      await api(token).post('/work-rules', STANDARD).expect(201);
      const employee = await colleague(organizationId, 'EMPLOYEE', 'emp');

      expect(
        (await api(employee).get('/work-rules').expect(200)).body.data,
      ).toHaveLength(1);
      await api(employee)
        .post('/work-rules', { ...STANDARD, name: 'Mine' })
        .expect(403);
    });

    it("keeps one company's rules from another", async () => {
      const a = await signUp('tenant-a');
      const b = await signUp('tenant-b');
      const rule = await api(a.token).post('/work-rules', STANDARD).expect(201);
      const id = rule.body.data.id as string;

      expect(
        (await api(b.token).get('/work-rules').expect(200)).body.data,
      ).toEqual([]);
      await api(b.token).get(`/work-rules/${id}`).expect(404);
      await api(b.token)
        .patch(`/work-rules/${id}`, { name: 'Hijacked' })
        .expect(404);
      await api(b.token).delete(`/work-rules/${id}`).expect(404);
    });

    it("refuses to attach another company's rule to an office", async () => {
      // The office update is spread straight into the database write; this is
      // the check that stops a foreign rule id riding along.
      const a = await signUp('foreign-a');
      const b = await signUp('foreign-b');
      const foreignRule = await api(a.token)
        .post('/work-rules', STANDARD)
        .expect(201);
      const office = await api(b.token)
        .post('/offices', { name: 'B Office', latitude: 6.5, longitude: 3.4 })
        .expect(201);

      await api(b.token)
        .put(`/offices/${office.body.data.id}`, {
          workRuleId: foreignRule.body.data.id,
        })
        .expect(400);
    });

    it('is audited', async () => {
      const { token } = await signUp('audit');
      const rule = await api(token).post('/work-rules', STANDARD).expect(201);
      const entry = await ctx.prisma.auditLog.findFirstOrThrow({
        where: { action: 'WORK_RULE_CREATED' },
      });
      expect(entry).toMatchObject({
        targetType: 'WorkRule',
        targetId: rule.body.data.id,
        targetLabel: 'Standard',
      });
    });
  });

  describe('rules feeding attendance', () => {
    it("an office's rule beats the company default", async () => {
      const { token, organizationId } = await signUp('precedence');

      // Default: starts at 23:59 — nobody could ever be late against it.
      await api(token)
        .post('/work-rules', {
          ...MIDNIGHT,
          name: 'Lenient',
          startTime: '23:58',
        })
        .expect(201);
      // Office rule: starts at midnight — lateness is the arrival minute.
      const strict = await api(token).post('/work-rules', MIDNIGHT).expect(201);
      const office = await api(token)
        .post('/offices', {
          name: 'Strict Branch',
          latitude: 6.5,
          longitude: 3.4,
        })
        .expect(201);
      await api(token)
        .put(`/offices/${office.body.data.id}`, {
          workRuleId: strict.body.data.id,
        })
        .expect(200);

      const worker = await colleague(
        organizationId,
        'EMPLOYEE',
        'worker',
        office.body.data.id as string,
      );
      const res = await api(worker).post('/attendance/clock-in').expect(201);
      const { summary } = res.body.data;
      const minute = localMoment(
        new Date(summary.firstClockIn as string),
        'Africa/Lagos',
      ).minutes;

      expect(summary.scheduledStartMinutes).toBe(0);
      expect(summary.lateMinutes).toBe(minute);
    });

    it('nobody is late on a holiday', async () => {
      const { token } = await signUp('holiday-late');
      await api(token).post('/work-rules', MIDNIGHT).expect(201);
      const today = localMoment(new Date(), 'Africa/Lagos').date;
      await api(token)
        .post('/holidays', { name: 'Founders Day', date: today })
        .expect(201);

      const res = await api(token).post('/attendance/clock-in').expect(201);
      expect(res.body.data.summary).toMatchObject({
        isLate: false,
        lateMinutes: 0,
      });
    });
  });

  describe('holidays', () => {
    it('lists a year, including annual holidays on their date in that year', async () => {
      const { token } = await signUp('holidays');
      await api(token)
        .post('/holidays', {
          name: 'New Year',
          date: '2026-01-01',
          repeatsAnnually: true,
        })
        .expect(201);
      await api(token)
        .post('/holidays', { name: 'Eid', date: '2026-03-20' })
        .expect(201);

      const in2027 = await api(token).get('/holidays?year=2027').expect(200);
      expect(in2027.body.data).toEqual([
        expect.objectContaining({ name: 'New Year', onDate: '2027-01-01' }),
      ]);
      const in2026 = await api(token).get('/holidays?year=2026').expect(200);
      expect(in2026.body.data.map((h: { name: string }) => h.name)).toEqual([
        'New Year',
        'Eid',
      ]);
    });

    it.each([
      ['a date that does not exist', { name: 'Odd', date: '2026-02-31' }],
      ['a malformed date', { name: 'Odd', date: '01-10-2026' }],
      ['an unknown type', { name: 'Odd', date: '2026-10-01', type: 'PARTY' }],
    ])('rejects %s with 400', async (_label, body) => {
      const { token } = await signUp(`hbad-${_label.length}`);
      await api(token).post('/holidays', body).expect(400);
    });

    it('refuses the same holiday twice with 409', async () => {
      const { token } = await signUp('hdup');
      const body = { name: 'Independence Day', date: '2026-10-01' };
      await api(token).post('/holidays', body).expect(201);
      await api(token).post('/holidays', body).expect(409);
    });

    it("keeps one company's calendar from another", async () => {
      const a = await signUp('htenant-a');
      const b = await signUp('htenant-b');
      const h = await api(a.token)
        .post('/holidays', { name: 'A Day', date: '2026-10-01' })
        .expect(201);

      expect(
        (await api(b.token).get('/holidays?year=2026').expect(200)).body.data,
      ).toEqual([]);
      await api(b.token).delete(`/holidays/${h.body.data.id}`).expect(404);
    });
  });

  describe('organisation settings', () => {
    it('starts in Africa/Lagos', async () => {
      const { token } = await signUp('org');
      const res = await api(token).get('/organization').expect(200);
      expect(res.body.data.timezone).toBe('Africa/Lagos');
    });

    it('refuses a timezone that does not exist', async () => {
      // A misspelt zone would otherwise fail on the first clock-in, for
      // everyone in the company.
      const { token } = await signUp('badtz');
      await api(token)
        .patch('/organization', { timezone: 'Lagos' })
        .expect(400);
    });

    it('moves which day a punch belongs to', async () => {
      const { token } = await signUp('tz');
      // UTC+14: for most of the day this is a different calendar date from
      // Lagos, so the punch's day must follow the setting, not the server.
      await api(token)
        .patch('/organization', { timezone: 'Pacific/Kiritimati' })
        .expect(200);

      const res = await api(token).post('/attendance/clock-in').expect(201);
      const expected = localMoment(
        new Date(res.body.data.punch.occurredAt as string),
        'Pacific/Kiritimati',
      ).date;
      expect(res.body.data.summary.workDate).toBe(expected);

      const entry = await ctx.prisma.auditLog.findFirstOrThrow({
        where: { action: 'ORGANIZATION_UPDATED' },
      });
      expect(entry.targetLabel).toMatch(/Africa\/Lagos → Pacific\/Kiritimati/);
    });

    it('lets only the super admin change it', async () => {
      const { organizationId } = await signUp('orgroles');
      const hr = await colleague(organizationId, 'HR_ADMIN', 'hr');
      await api(hr).get('/organization').expect(200);
      await api(hr)
        .patch('/organization', { timezone: 'Europe/London' })
        .expect(403);
    });
  });
});
