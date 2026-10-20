import { AttendanceStatus, PunchType, UserStatus } from '@prisma/client';
import {
  createTestApp,
  registerOrganization,
  TestContext,
} from './helpers/test-app';
import { DayCloseService } from '../src/attendance/day-close.service';
import { toDbDate } from '../src/attendance/attendance-time';

/**
 * Phase 3 M6 — the end-of-day job, against a real database.
 *
 * Every test fixes `now`, so the days being closed are known whatever day the
 * suite runs. Past punches are inserted directly: the API, correctly, will not
 * let anyone record a punch at a time other than now.
 *
 * NOW = Thursday 15 Oct 2026, 11:00 in Lagos. With a three-day lookback the
 * job closes Wed 14, Tue 13 and Mon 12.
 */
const NOW = new Date('2026-10-15T10:00:00Z');
const WED = '2026-10-14';

describe('End-of-day job (integration)', () => {
  let ctx: TestContext;
  const job = () => ctx.app.get(DayCloseService);

  /** An organisation with a Mon–Fri 08:00–17:00 default rule. */
  const orgWithRule = async (suffix: string) => {
    const email = `close-${suffix}@test.local`;
    await registerOrganization(ctx, {
      organizationName: `Close ${suffix}`,
      email,
      adminName: `Admin ${suffix}`,
    });
    const admin = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
    const organizationId = admin.organizationId;
    await ctx.prisma.workRule.create({
      data: {
        organizationId,
        name: 'Standard',
        isDefault: true,
        workingDays: [1, 2, 3, 4, 5],
        startMinutes: 480,
        endMinutes: 1020,
        gracePeriodMinutes: 10,
      },
    });
    return organizationId;
  };

  /** An employee who has existed since September (so was expected at work). */
  const employee = (
    organizationId: string,
    suffix: string,
    status: UserStatus = 'ACTIVE',
    createdAt = new Date('2026-09-01T09:00:00Z'),
  ) =>
    ctx.prisma.user.create({
      data: {
        employeeId: `EMP-CLOSE-${suffix}`,
        name: `Employee ${suffix}`,
        email: `close-emp-${suffix}@test.local`,
        role: 'EMPLOYEE',
        status,
        organizationId,
        createdAt,
      },
    });

  const summaries = (userId: string) =>
    ctx.prisma.attendanceSummary.findMany({
      where: { userId },
      orderBy: { workDate: 'asc' },
    });

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('marks a working day nobody punched as ABSENT', async () => {
    const org = await orgWithRule('absent');
    const e = await employee(org, 'absent');

    await job().closeEndedDays(NOW);

    const rows = await summaries(e.id);
    expect(rows.map((r) => r.workDate.toISOString().slice(0, 10))).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
    ]);
    expect(rows.every((r) => r.status === AttendanceStatus.ABSENT)).toBe(true);
  });

  it('is idempotent — a second pass changes nothing', async () => {
    const org = await orgWithRule('idem');
    await employee(org, 'idem');

    const first = await job().closeEndedDays(NOW);
    const second = await job().closeEndedDays(NOW);

    expect(first.created).toBe(3);
    expect(second).toMatchObject({ created: 0, updated: 0 });
  });

  it('flags a day left clocked in — and invents no clock-out', async () => {
    const org = await orgWithRule('open');
    const e = await employee(org, 'open');

    // What the punch path would have written at 08:05 on Wednesday.
    await ctx.prisma.punchEvent.create({
      data: {
        organizationId: org,
        userId: e.id,
        type: PunchType.CLOCK_IN,
        occurredAt: new Date('2026-10-14T07:05:00Z'),
        workDate: toDbDate(WED),
      },
    });
    await ctx.prisma.attendanceSummary.create({
      data: {
        organizationId: org,
        userId: e.id,
        workDate: toDbDate(WED),
        status: AttendanceStatus.PRESENT,
        firstClockIn: new Date('2026-10-14T07:05:00Z'),
      },
    });

    await job().closeEndedDays(NOW);

    const wed = await ctx.prisma.attendanceSummary.findFirstOrThrow({
      where: { userId: e.id, workDate: toDbDate(WED) },
    });
    expect(wed).toMatchObject({
      status: 'PRESENT',
      isIncomplete: true,
      lastClockOut: null,
    });
    expect(await ctx.prisma.punchEvent.count({ where: { userId: e.id } })).toBe(
      1,
    );
  });

  it('turns ABSENT into ON_HOLIDAY when the holiday is entered afterwards', async () => {
    const org = await orgWithRule('lateholiday');
    const e = await employee(org, 'lateholiday');

    await job().closeEndedDays(NOW);
    await ctx.prisma.holiday.create({
      data: {
        organizationId: org,
        name: 'Surprise closure',
        date: toDbDate(WED),
      },
    });
    const rerun = await job().closeEndedDays(NOW);

    const wed = await ctx.prisma.attendanceSummary.findFirstOrThrow({
      where: { userId: e.id, workDate: toDbDate(WED) },
    });
    expect(wed.status).toBe(AttendanceStatus.ON_HOLIDAY);
    expect(rerun.updated).toBe(1);
  });

  it('marks the weekend as REST_DAY, not absent', async () => {
    const org = await orgWithRule('weekend');
    const e = await employee(org, 'weekend');

    // Monday 19 Oct, 11:00 Lagos → closes Sun 18, Sat 17, Fri 16.
    await job().closeEndedDays(new Date('2026-10-19T10:00:00Z'));

    const byDay = Object.fromEntries(
      (await summaries(e.id)).map((r) => [
        r.workDate.toISOString().slice(0, 10),
        r.status,
      ]),
    );
    expect(byDay).toEqual({
      '2026-10-16': 'ABSENT',
      '2026-10-17': 'REST_DAY',
      '2026-10-18': 'REST_DAY',
    });
  });

  it('skips people who were not expected at work', async () => {
    const org = await orgWithRule('skip');
    const suspended = await employee(org, 'suspended', 'SUSPENDED');
    const pending = await employee(org, 'pending', 'PENDING');
    const removed = await employee(org, 'removed', 'DELETED');
    // Invited on Tuesday afternoon: not absent Monday or Tuesday, absent Wednesday.
    const newcomer = await employee(
      org,
      'newcomer',
      'ACTIVE',
      new Date('2026-10-13T13:00:00Z'),
    );

    await job().closeEndedDays(NOW);

    for (const u of [suspended, pending, removed]) {
      expect(await summaries(u.id)).toEqual([]);
    }
    const newcomerDays = (await summaries(newcomer.id)).map((r) =>
      r.workDate.toISOString().slice(0, 10),
    );
    expect(newcomerDays).toEqual([WED]);
  });

  it('writes nothing for an organisation that has configured no hours', async () => {
    // Nobody is absent from hours that were never set.
    const email = 'close-norule@test.local';
    await registerOrganization(ctx, {
      organizationName: 'No Rule Co',
      email,
      adminName: 'Admin',
    });
    const { organizationId } = await ctx.prisma.user.findUniqueOrThrow({
      where: { email },
    });
    const e = await employee(organizationId, 'norule');

    await job().closeEndedDays(NOW);

    expect(await summaries(e.id)).toEqual([]);
  });

  it("closes each organisation's own day, in its own timezone", async () => {
    // 10:00 UTC on Thursday is already Friday 00:00 in Kiritimati (UTC+14),
    // so for that organisation THURSDAY has just ended and is closed too.
    const org = await orgWithRule('kiritimati');
    await ctx.prisma.organization.update({
      where: { id: org },
      data: { timezone: 'Pacific/Kiritimati' },
    });
    const e = await employee(org, 'kiritimati');

    await job().closeEndedDays(NOW);

    const days = (await summaries(e.id)).map((r) =>
      r.workDate.toISOString().slice(0, 10),
    );
    expect(days).toEqual(['2026-10-13', '2026-10-14', '2026-10-15']);
  });

  it('records one audit entry per organisation per day, as the system', async () => {
    const org = await orgWithRule('audit');
    await employee(org, 'audit-1');
    await employee(org, 'audit-2');

    await job().closeEndedDays(NOW);

    const entries = await ctx.prisma.auditLog.findMany({
      where: { organizationId: org, action: 'ATTENDANCE_DAY_CLOSED' },
      orderBy: { targetLabel: 'asc' },
    });
    expect(entries).toHaveLength(3); // Mon, Tue, Wed — not one per person
    expect(entries[0]).toMatchObject({ actorId: null, actorName: 'System' });
    expect(entries[2].targetLabel).toMatch(
      /^2026-10-14: 2 absent, 0 incomplete/,
    );
  });
});
