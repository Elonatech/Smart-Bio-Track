import request from 'supertest';
import {
  ME_RESPONSE_KEYS,
  USER_LIST_ITEM_KEYS,
} from '@smartbiotrack/types';
import { AuthService } from '../src/auth/auth.service';
import {
  createTestApp,
  httpServer,
  registerOrganization,
  requireRefreshCookie,
  TestContext,
} from './helpers/test-app';

describe('Auth flow and RBAC (integration)', () => {
  let ctx: TestContext;
  let adminToken: string;
  let adminRefresh: string;
  let adminEmployeeId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await ctx.reset();

    const tokens = await registerOrganization(ctx, {
      organizationName: 'Acme Corp',
      email: 'ada@acme.test',
      adminName: 'Ada Owner',
    });

    adminToken = tokens.accessToken;
    adminRefresh = tokens.refreshToken;
    adminEmployeeId = tokens.employeeId;
  });

  afterAll(async () => {
    await ctx.close();
  });

  /** Provisions a user and completes their registration; returns their token. */
  const onboard = async (role: string, suffix: string) => {
    await request(httpServer(ctx))
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeId: `EMP-${suffix}`,
        name: `User ${suffix}`,
        email: `${suffix}@acme.test`,
        role,
      })
      .expect(201);

    const activated = await request(httpServer(ctx))
      .post('/api/auth/complete-registration')
      .send({
        token: ctx.mail.tokenFor(`${suffix}@acme.test`, 'activation'),
        password: 'Passw0rd!',
        confirmPassword: 'Passw0rd!',
      })
      .expect(200);

    return activated.body.data.accessToken as string;
  };

  describe('provisioning → activation → login', () => {
    it('creates the user PENDING with no password, then activates them', async () => {
      const provisioned = await request(httpServer(ctx))
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeId: 'EMP-100',
          name: 'Bob',
          email: 'bob@acme.test',
          role: 'EMPLOYEE',
        })
        .expect(201);

      const userId = provisioned.body.data.id;

      let user = await ctx.prisma.user.findUnique({ where: { id: userId } });
      expect(user?.status).toBe('PENDING');
      expect(user?.passwordHash).toBeNull();

      await request(httpServer(ctx))
        .post('/api/auth/complete-registration')
        .send({
          token: ctx.mail.tokenFor('bob@acme.test', 'activation'),
          password: 'Passw0rd!',
          confirmPassword: 'Passw0rd!',
        })
        .expect(200);

      user = await ctx.prisma.user.findUnique({ where: { id: userId } });
      expect(user?.status).toBe('ACTIVE');
      expect(user?.passwordHash).toEqual(expect.any(String));
    });

    it('refuses to reuse an activation token', async () => {
      await request(httpServer(ctx))
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeId: 'EMP-101',
          name: 'Carol',
          email: 'carol@acme.test',
          role: 'EMPLOYEE',
        })
        .expect(201);

      const token = ctx.mail.tokenFor('carol@acme.test', 'activation');

      await request(httpServer(ctx))
        .post('/api/auth/complete-registration')
        .send({ token, password: 'Passw0rd!', confirmPassword: 'Passw0rd!' })
        .expect(200);

      await request(httpServer(ctx))
        .post('/api/auth/complete-registration')
        .send({ token, password: 'Other123!', confirmPassword: 'Other123!' })
        .expect(400);
    });

    it('rejects login for a PENDING user who never activated', async () => {
      await request(httpServer(ctx))
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeId: 'EMP-102',
          name: 'Dan',
          email: 'dan@acme.test',
          role: 'EMPLOYEE',
        })
        .expect(201);

      await request(httpServer(ctx))
        .post('/api/auth/login')
        .send({ identifier: 'dan@acme.test', password: 'Passw0rd!' })
        .expect(401);
    });
  });

  describe('login by employee ID or email (FR-001)', () => {
    it('accepts an email', async () => {
      await request(httpServer(ctx))
        .post('/api/auth/login')
        .send({ identifier: 'ada@acme.test', password: 'Passw0rd!' })
        .expect(200);
    });

    it('accepts an employee ID', async () => {
      await request(httpServer(ctx))
        .post('/api/auth/login')
        .send({ identifier: adminEmployeeId, password: 'Passw0rd!' })
        .expect(200);
    });

    it('is case-insensitive on email', async () => {
      await request(httpServer(ctx))
        .post('/api/auth/login')
        .send({ identifier: 'ADA@ACME.TEST', password: 'Passw0rd!' })
        .expect(200);
    });
  });

  describe('role ceiling', () => {
    it('lets a SUPER_ADMIN create another SUPER_ADMIN', async () => {
      await request(httpServer(ctx))
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeId: 'SA002',
          name: 'Second Owner',
          email: 'owner2@acme.test',
          role: 'SUPER_ADMIN',
        })
        .expect(201);
    });

    it('forbids an HR_ADMIN from creating a SUPER_ADMIN', async () => {
      const hrToken = await onboard('HR_ADMIN', 'hr');

      const res = await request(httpServer(ctx))
        .post('/api/users')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          employeeId: 'ESCALATE',
          name: 'Escalation',
          email: 'escalate@acme.test',
          role: 'SUPER_ADMIN',
        })
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('lets an HR_ADMIN create an EMPLOYEE', async () => {
      const hrToken = await onboard('HR_ADMIN', 'hr2');

      await request(httpServer(ctx))
        .post('/api/users')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          employeeId: 'EMP-200',
          name: 'Normal Hire',
          email: 'hire@acme.test',
          role: 'EMPLOYEE',
        })
        .expect(201);
    });

    it('forbids an EMPLOYEE from provisioning anyone', async () => {
      const empToken = await onboard('EMPLOYEE', 'emp');

      await request(httpServer(ctx))
        .post('/api/users')
        .set('Authorization', `Bearer ${empToken}`)
        .send({
          employeeId: 'EMP-300',
          name: 'Nope',
          email: 'nope@acme.test',
          role: 'EMPLOYEE',
        })
        .expect(403);
    });

    it('forbids an EMPLOYEE from creating a department', async () => {
      const empToken = await onboard('EMPLOYEE', 'emp2');

      await request(httpServer(ctx))
        .post('/api/departments')
        .set('Authorization', `Bearer ${empToken}`)
        .send({ name: 'Unauthorized' })
        .expect(403);
    });

    it('allows every role to read its own profile', async () => {
      const empToken = await onboard('EMPLOYEE', 'emp3');

      const res = await request(httpServer(ctx))
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${empToken}`)
        .expect(200);

      expect(res.body.data.role).toBe('EMPLOYEE');
    });
  });

  // The only check here that survives compilation.
  //
  // Both apps are annotated against the shared shapes in packages/types, so a
  // mismatch fails tsc — but types vanish at runtime, and nothing compares a
  // JSON body to an interface. A field the API quietly starts or stops sending
  // is invisible to the browser's compiler and shows up as a blank on screen.
  // These assert the actual wire format against the key lists.
  describe('response shapes (#26)', () => {
    it('GET /auth/me returns exactly the documented fields', async () => {
      const res = await request(httpServer(ctx))
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Sorted equality, not "contains": an *extra* field matters as much as a
      // missing one. Extra fields are how data nobody meant to publish reaches
      // the browser.
      expect(Object.keys(res.body.data).sort()).toEqual(
        [...ME_RESPONSE_KEYS].sort(),
      );
    });

    it('GET /users rows carry exactly the documented fields', async () => {
      await onboard('EMPLOYEE', 'shape');

      const res = await request(httpServer(ctx))
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.items.length).toBeGreaterThan(0);

      for (const item of res.body.data.items) {
        expect(Object.keys(item).sort()).toEqual([...USER_LIST_ITEM_KEYS].sort());
      }
    });

    it('never leaks a password hash to any client', async () => {
      // The reason "exactly" beats "contains" above, stated as its own test so
      // it cannot be weakened by accident.
      const res = await request(httpServer(ctx))
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const serialised = JSON.stringify(res.body);
      expect(serialised).not.toContain('passwordHash');
      expect(serialised).not.toContain('$argon2');
    });
  });

  describe('account lockout', () => {
    const LOGIN = '/api/auth/login';

    /**
     * Waits for the detached failed-attempt writes to finish.
     *
     * The counter is written outside the request on purpose — awaiting a
     * database round trip on a refusal would make a real account measurably
     * slower to reject than an unknown one, rebuilding the timing oracle #19
     * closed. So the row is updated shortly *after* the response.
     *
     * This asks the service itself when it is finished rather than polling the
     * database until the numbers look right. Polling passes as soon as the
     * value it wants appears, which is not the same as the writes being done —
     * the leftovers then collide with the TRUNCATE in the next test's
     * beforeEach, and fourteen unrelated tests further down the file fail with
     * no visible connection to this one. That happened.
     */
    const settleWrites = () =>
      ctx.app.get(AuthService).flushPendingWrites();

    const failLogin = (identifier: string) =>
      request(httpServer(ctx))
        .post(LOGIN)
        .send({ identifier, password: 'WrongPassw0rd!' })
        .expect(401);

    it('locks an account after five failed attempts', async () => {
      await onboard('EMPLOYEE', 'lockme');
      const email = 'lockme@acme.test';

      for (let i = 0; i < 5; i++) await failLogin(email);
      await settleWrites();

      const locked = await ctx.prisma.user.findUnique({ where: { email } });
      expect(locked?.lockedUntil).toBeTruthy();

      // The correct password, refused — which is the whole point. A lockout
      // that the right password walks through protects nothing.
      const refused = await request(httpServer(ctx))
        .post(LOGIN)
        .send({ identifier: email, password: 'Passw0rd!' })
        .expect(401);

      expect(refused.body.message).toMatch(/too many failed attempts/i);
    });

    it('tells a wrong password nothing about the lock', async () => {
      await onboard('EMPLOYEE', 'locksecret');
      const email = 'locksecret@acme.test';

      for (let i = 0; i < 5; i++) await failLogin(email);
      await settleWrites();

      // Announcing the lock to someone still guessing would say "this address
      // is real, and under attack" — enumeration rebuilt from the other end.
      const stillGuessing = await failLogin(email);
      expect(stillGuessing.body.message).toBe('Invalid credentials');

      // That last attempt started a write of its own.
      await settleWrites();
    });

    it('records the lockout in the audit trail', async () => {
      await onboard('EMPLOYEE', 'lockaudit');
      const email = 'lockaudit@acme.test';

      for (let i = 0; i < 5; i++) await failLogin(email);
      await settleWrites();

      const entries = await request(httpServer(ctx))
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ action: 'USER_LOCKED_OUT' })
        .expect(200);

      expect(entries.body.data.items).toHaveLength(1);
      // No person did this, and the trail says so rather than leaving a blank
      // name for a reader to interpret.
      expect(entries.body.data.items[0].actorName).toBe('System');
      expect(entries.body.data.items[0].actorId).toBeNull();
    });

    it('clears the count when a sign-in succeeds', async () => {
      await onboard('EMPLOYEE', 'lockreset');
      const email = 'lockreset@acme.test';

      await failLogin(email);
      await failLogin(email);
      await settleWrites();

      await request(httpServer(ctx))
        .post(LOGIN)
        .send({ identifier: email, password: 'Passw0rd!' })
        .expect(200);

      const row = await ctx.prisma.user.findUnique({ where: { email } });
      expect(row?.failedLoginAttempts).toBe(0);
      expect(row?.lockedUntil).toBeNull();
    });

    it('never counts attempts against an address with no account', async () => {
      // Nothing to count, and nothing to create either: a row written for an
      // unknown address would be a record of who an attacker guessed at.
      await failLogin('nobody@acme.test');
      await failLogin('nobody@acme.test');
      await settleWrites();

      const row = await ctx.prisma.user.findUnique({
        where: { email: 'nobody@acme.test' },
      });
      expect(row).toBeNull();
    });
  });

  describe('audit trail', () => {
    it('records a suspension against the real database', async () => {
      const emp = await onboard('EMPLOYEE', 'audit1');
      void emp;
      const user = await ctx.prisma.user.findUnique({
        where: { email: 'audit1@acme.test' },
      });

      await request(httpServer(ctx))
        .patch(`/api/users/${user!.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const entry = await ctx.prisma.auditLog.findFirst({
        where: { targetId: user!.id, action: 'USER_SUSPENDED' },
      });

      expect(entry).not.toBeNull();
      // Denormalised on purpose: an id alone is unreadable once the person is
      // gone, which is exactly when the trail gets consulted.
      expect(entry?.actorName).toBeTruthy();
      expect(entry?.targetLabel).toContain(user!.name);
    });

    it('rolls the action back if the audit write fails', async () => {
      // The property the whole design rests on. Recording happens inside the
      // action's transaction, so there is no path that performs a suspension
      // without leaving a record. Forced here by pointing the entry at an
      // organization that does not exist, which the foreign key rejects.
      //
      // Self-contained on purpose: beforeEach truncates every table, so a test
      // that borrows another's fixtures passes or fails depending on order.
      await onboard('EMPLOYEE', 'auditrollback');
      const user = await ctx.prisma.user.findUnique({
        where: { email: 'auditrollback@acme.test' },
      });
      const before = user!.status;

      await expect(
        ctx.prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: user!.id },
            data: { status: 'ACTIVE' },
          });
          await tx.auditLog.create({
            data: {
              organizationId: '00000000-0000-0000-0000-000000000000',
              actorName: 'Nobody',
              action: 'USER_RESTORED',
            },
          });
        }),
      ).rejects.toThrow();

      const after = await ctx.prisma.user.findUnique({
        where: { id: user!.id },
      });
      expect(after?.status).toBe(before);
    });

    it('is scoped to the caller organization and closed to non-admins', async () => {
      const res = await request(httpServer(ctx))
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data.items)).toBe(true);
      for (const entry of res.body.data.items as { id: string }[]) {
        const row = await ctx.prisma.auditLog.findUnique({
          where: { id: entry.id },
        });
        expect(row?.organizationId).toBeTruthy();
      }

      // HR_ADMIN can manage users but appears in this trail as a subject.
      // Reading it is a SUPER_ADMIN decision.
      const hrToken = await onboard('HR_ADMIN', 'audithr');
      await request(httpServer(ctx))
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${hrToken}`)
        .expect(403);
    });

    it('rejects an unknown action filter rather than returning nothing', async () => {
      // An empty result reads to an auditor exactly like "this never happened".
      await request(httpServer(ctx))
        .get('/api/audit-logs?action=NOT_A_REAL_ACTION')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  describe('user list paging', () => {
    it('caps limit rather than trusting it', async () => {
      // Without a ceiling the cap is decoration: ?limit=999999 reinstates the
      // unbounded response paging exists to prevent, and anyone can ask.
      await request(httpServer(ctx))
        .get('/api/users?limit=999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('rejects a page before the first', async () => {
      await request(httpServer(ctx))
        .get('/api/users?page=0')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('returns a page envelope with totals', async () => {
      const res = await request(httpServer(ctx))
        .get('/api/users?page=1&limit=2')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeLessThanOrEqual(2);
      expect(res.body.data).toMatchObject({ page: 1, limit: 2 });
      expect(typeof res.body.data.total).toBe('number');
      expect(res.body.data.totalPages).toBeGreaterThanOrEqual(1);
    });

    it('does not repeat a row between consecutive pages', async () => {
      // The bug paging introduces if ordering is left to Postgres: without a
      // deterministic ORDER BY, page 2 can repeat rows from page 1 and skip
      // others entirely.
      await onboard('EMPLOYEE', 'pg1');
      await onboard('EMPLOYEE', 'pg2');
      await onboard('EMPLOYEE', 'pg3');

      const first = await request(httpServer(ctx))
        .get('/api/users?page=1&limit=2')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const second = await request(httpServer(ctx))
        .get('/api/users?page=2&limit=2')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const ids = [
        ...first.body.data.items.map((u: { id: string }) => u.id),
        ...second.body.data.items.map((u: { id: string }) => u.id),
      ];
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('searches across name, email and employee ID', async () => {
      await onboard('EMPLOYEE', 'findme');

      for (const term of ['findme@acme.test', 'EMP-findme', 'User findme']) {
        const res = await request(httpServer(ctx))
          .get(`/api/users?q=${encodeURIComponent(term)}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('keeps the tenant scope while searching', async () => {
      // A search must narrow the caller's own rows, never reach past them.
      const res = await request(httpServer(ctx))
        .get('/api/users?q=admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      for (const user of res.body.data.items as { email: string }[]) {
        expect(user.email).toContain('acme.test');
      }
    });
  });

  describe('resend invitation', () => {
    /** Provisions a user and stops, leaving them PENDING. */
    const invite = async (suffix: string) => {
      await request(httpServer(ctx))
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeId: `EMP-${suffix}`,
          name: `User ${suffix}`,
          email: `${suffix}@acme.test`,
          role: 'EMPLOYEE',
        })
        .expect(201);

      const user = await ctx.prisma.user.findUnique({
        where: { email: `${suffix}@acme.test` },
      });
      return user!;
    };

    it('invalidates the first link and lets the second one activate', async () => {
      const user = await invite('resend1');
      const firstToken = ctx.mail.tokenFor('resend1@acme.test', 'activation');

      // The cooldown is keyed on the previous token's createdAt, so age it
      // rather than sleeping through it.
      await ctx.prisma.activationToken.updateMany({
        where: { userId: user.id },
        data: { createdAt: new Date(Date.now() - 10 * 60 * 1000) },
      });

      await request(httpServer(ctx))
        .post(`/api/users/${user.id}/resend-invitation`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const secondToken = ctx.mail.tokenFor('resend1@acme.test', 'activation');
      expect(secondToken).not.toBe(firstToken);

      // The superseded link must be dead, or every resend widens the window
      // instead of replacing it.
      await request(httpServer(ctx))
        .post('/api/auth/complete-registration')
        .send({
          token: firstToken,
          password: 'Passw0rd!',
          confirmPassword: 'Passw0rd!',
        })
        .expect(400);

      await request(httpServer(ctx))
        .post('/api/auth/complete-registration')
        .send({
          token: secondToken,
          password: 'Passw0rd!',
          confirmPassword: 'Passw0rd!',
        })
        .expect(200);
    });

    it('stores more than one activation token for the same user', async () => {
      // The constraint this whole item was about: userId was @unique, so a
      // second invitation could not physically exist.
      const user = await invite('resend2');

      await ctx.prisma.activationToken.updateMany({
        where: { userId: user.id },
        data: { createdAt: new Date(Date.now() - 10 * 60 * 1000) },
      });

      await request(httpServer(ctx))
        .post(`/api/users/${user.id}/resend-invitation`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const count = await ctx.prisma.activationToken.count({
        where: { userId: user.id },
      });
      expect(count).toBe(2);
    });

    it('refuses a second send inside the cooldown', async () => {
      const user = await invite('resend3');

      await request(httpServer(ctx))
        .post(`/api/users/${user.id}/resend-invitation`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('refuses to re-invite a user who has already activated', async () => {
      await onboard('EMPLOYEE', 'resend4');
      const user = await ctx.prisma.user.findUnique({
        where: { email: 'resend4@acme.test' },
      });

      await request(httpServer(ctx))
        .post(`/api/users/${user!.id}/resend-invitation`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('is closed to an EMPLOYEE', async () => {
      const empToken = await onboard('EMPLOYEE', 'resend5');
      const user = await invite('resend6');

      await request(httpServer(ctx))
        .post(`/api/users/${user.id}/resend-invitation`)
        .set('Authorization', `Bearer ${empToken}`)
        .expect(403);
    });
  });

  describe('refresh rotation', () => {
    it('accepts an immediate replay, so two browser tabs both survive', async () => {
      // Strict rotation would 401 here, and that is not a hypothetical
      // annoyance: every tab refreshes on load, so two tabs opening together
      // send the same cookie milliseconds apart and the second one loses.
      // Inside the grace window it gets a token of its own instead.
      await request(httpServer(ctx))
        .post('/api/auth/refresh')
        .send({ refreshToken: adminRefresh })
        .expect(200);

      const replay = await request(httpServer(ctx))
        .post('/api/auth/refresh')
        .send({ refreshToken: adminRefresh })
        .expect(200);

      expect(requireRefreshCookie(replay)).not.toBe(adminRefresh);
    });

    it('treats a replay after the grace window as theft and kills the session', async () => {
      const login = await request(httpServer(ctx))
        .post('/api/auth/login')
        .send({ identifier: 'ada@acme.test', password: 'Passw0rd!' })
        .expect(200);

      const stolen = requireRefreshCookie(login);

      const rotated = await request(httpServer(ctx))
        .post('/api/auth/refresh')
        .send({ refreshToken: stolen })
        .expect(200);

      const successor = requireRefreshCookie(rotated);

      // Backdating rotatedAt is how the window is aged without a 30-second
      // sleep in the suite. Everything else is the real code path.
      const spent = await ctx.prisma.refreshToken.findFirst({
        where: { rotatedAt: { not: null } },
        orderBy: { createdAt: 'desc' },
      });
      await ctx.prisma.refreshToken.update({
        where: { id: spent!.id },
        data: { rotatedAt: new Date(Date.now() - 10 * 60 * 1000) },
      });

      await request(httpServer(ctx))
        .post('/api/auth/refresh')
        .send({ refreshToken: stolen })
        .expect(401);

      // The point of the feature. Refusing the replay alone would leave the
      // thief's successor token working — they rotated a moment ago, which is
      // exactly why the original came back spent. The whole family goes.
      await request(httpServer(ctx))
        .post('/api/auth/refresh')
        .send({ refreshToken: successor })
        .expect(401);
    });

    it('issues distinct tokens for rapid successive logins', async () => {
      // Regression: the payload was { sub, email, role } plus JWT's own `iat`,
      // which has one-second resolution — so two logins inside the same second
      // produced byte-identical tokens and a unique-constraint 500 on
      // tokenHash. A double-clicked sign-in button was enough to trigger it.
      const login = () =>
        request(httpServer(ctx))
          .post('/api/auth/login')
          .send({ identifier: 'ada@acme.test', password: 'Passw0rd!' })
          .expect(200);

      const [first, second, third] = await Promise.all([
        login(),
        login(),
        login(),
      ]);

      const tokens = [first, second, third].map(requireRefreshCookie);
      expect(new Set(tokens).size).toBe(3);
    });

    it('stores only a hash, never the raw refresh token', async () => {
      const stored = await ctx.prisma.refreshToken.findFirst();

      expect(stored?.tokenHash).toHaveLength(64);
      expect(stored?.tokenHash).not.toBe(adminRefresh);
    });
  });

  describe('logout', () => {
    it('revokes the supplied refresh token', async () => {
      await request(httpServer(ctx))
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ refreshToken: adminRefresh })
        .expect(200);

      await request(httpServer(ctx))
        .post('/api/auth/refresh')
        .send({ refreshToken: adminRefresh })
        .expect(401);
    });

    it("refuses to revoke another user's refresh token", async () => {
      const empToken = await onboard('EMPLOYEE', 'emp4');

      await request(httpServer(ctx))
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${empToken}`)
        .send({ refreshToken: adminRefresh })
        .expect(400);

      // The admin's session must survive.
      await request(httpServer(ctx))
        .post('/api/auth/refresh')
        .send({ refreshToken: adminRefresh })
        .expect(200);
    });
  });

  describe('delete account', () => {
    it('requires authentication', async () => {
      await request(httpServer(ctx)).delete('/api/auth/account').expect(401);
    });

    it('keeps the record, ends the access, and kills every way back in', async () => {
      const empToken = await onboard('EMPLOYEE', 'emp5');
      const empUser = await ctx.prisma.user.findUnique({
        where: { email: 'emp5@acme.test' },
      });

      await request(httpServer(ctx))
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${empToken}`)
        .expect(200);

      // The row survives on purpose. Phase 3 hangs attendance off userId, and
      // those records have to outlive the person — they are the evidence in a
      // pay dispute with someone who has already left.
      const deleted = await ctx.prisma.user.findUnique({
        where: { email: 'emp5@acme.test' },
      });
      expect(deleted).not.toBeNull();
      expect(deleted?.status).toBe('DELETED');
      expect(deleted?.deletedAt).toBeInstanceOf(Date);

      // Keeping the row must not mean keeping the access. The status alone
      // stops new requests, because JwtStrategy refuses anyone not ACTIVE.
      await request(httpServer(ctx))
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${empToken}`)
        .expect(401);

      // An unredeemed invitation is a live route back into a closed account,
      // so it is spent rather than left dangling.
      const liveInvites = await ctx.prisma.activationToken.count({
        where: { userId: empUser?.id, usedAt: null },
      });
      expect(liveInvites).toBe(0);

      // Same for sessions: a refresh token would otherwise keep minting
      // access for a user nobody can see any more.
      const liveSessions = await ctx.prisma.refreshToken.count({
        where: { userId: empUser?.id, revoked: false },
      });
      expect(liveSessions).toBe(0);
    });

    it('refuses to sign a deleted user back in with the right password', async () => {
      await onboard('EMPLOYEE', 'emp6');

      const login = await request(httpServer(ctx))
        .post('/api/auth/login')
        .send({ identifier: 'emp6@acme.test', password: 'Passw0rd!' })
        .expect(200);

      await request(httpServer(ctx))
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`)
        .expect(200);

      // The guard in login used to ask "is this SUSPENDED?", which answers no
      // for any status added later — so DELETED would have signed straight in.
      await request(httpServer(ctx))
        .post('/api/auth/login')
        .send({ identifier: 'emp6@acme.test', password: 'Passw0rd!' })
        .expect(401);
    });
  });

  describe('suspension', () => {
    it('kills an existing session and lets a restore sign in again', async () => {
      const empToken = await onboard('EMPLOYEE', 'susp');
      const emp = await ctx.prisma.user.findUnique({
        where: { email: 'susp@acme.test' },
      });

      // Working before.
      await request(httpServer(ctx))
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${empToken}`)
        .expect(200);

      await request(httpServer(ctx))
        .patch(`/api/users/${emp?.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Dead immediately — JwtStrategy re-reads status per request, so the
      // unexpired access token stops working without waiting for its TTL.
      await request(httpServer(ctx))
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${empToken}`)
        .expect(401);

      await request(httpServer(ctx))
        .post('/api/auth/login')
        .send({ identifier: 'susp@acme.test', password: 'Passw0rd!' })
        .expect(401);

      // Toggling back restores access.
      await request(httpServer(ctx))
        .patch(`/api/users/${emp?.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(httpServer(ctx))
        .post('/api/auth/login')
        .send({ identifier: 'susp@acme.test', password: 'Passw0rd!' })
        .expect(200);
    });

    it('will not refresh a session for a user suspended outside the toggle', async () => {
      await onboard('EMPLOYEE', 'susp2');

      const login = await request(httpServer(ctx))
        .post('/api/auth/login')
        .send({ identifier: 'susp2@acme.test', password: 'Passw0rd!' })
        .expect(200);

      // Suspended straight in the database, so the refresh token survives —
      // this is the case PATCH /users/:id/status would otherwise have cleaned
      // up, and the only way refresh's own status check is reached.
      await ctx.prisma.user.update({
        where: { email: 'susp2@acme.test' },
        data: { status: 'SUSPENDED' },
      });

      await request(httpServer(ctx))
        .post('/api/auth/refresh')
        .send({ refreshToken: requireRefreshCookie(login) })
        .expect(401);
    });
  });

  describe('password reset', () => {
    it('reveals nothing about whether an email is registered', async () => {
      const known = await request(httpServer(ctx))
        .post('/api/auth/forgot-password')
        .send({ email: 'ada@acme.test' })
        .expect(200);

      const unknown = await request(httpServer(ctx))
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@acme.test' })
        .expect(200);

      expect(known.body.message).toBe(unknown.body.message);
      expect(unknown.body.data).toBeNull();
    });

    it('resets the password and revokes every existing session', async () => {
      await request(httpServer(ctx))
        .post('/api/auth/forgot-password')
        .send({ email: 'ada@acme.test' })
        .expect(200);

      await request(httpServer(ctx))
        .post('/api/auth/reset-password')
        .send({
          token: ctx.mail.tokenFor('ada@acme.test', 'reset'),
          password: 'BrandNew1!',
          confirmPassword: 'BrandNew1!',
        })
        .expect(200);

      // Old session gone.
      await request(httpServer(ctx))
        .post('/api/auth/refresh')
        .send({ refreshToken: adminRefresh })
        .expect(401);

      // Old password gone, new one works.
      await request(httpServer(ctx))
        .post('/api/auth/login')
        .send({ identifier: 'ada@acme.test', password: 'Passw0rd!' })
        .expect(401);

      await request(httpServer(ctx))
        .post('/api/auth/login')
        .send({ identifier: 'ada@acme.test', password: 'BrandNew1!' })
        .expect(200);
    });

    it('refuses to reuse a reset token', async () => {
      await request(httpServer(ctx))
        .post('/api/auth/forgot-password')
        .send({ email: 'ada@acme.test' })
        .expect(200);

      const body = {
        token: ctx.mail.tokenFor('ada@acme.test', 'reset'),
        password: 'BrandNew1!',
        confirmPassword: 'BrandNew1!',
      };

      await request(httpServer(ctx))
        .post('/api/auth/reset-password')
        .send(body)
        .expect(200);
      await request(httpServer(ctx))
        .post('/api/auth/reset-password')
        .send(body)
        .expect(400);
    });
  });

  describe('response envelope (PRTS §A8)', () => {
    it('wraps success responses', async () => {
      const res = await request(httpServer(ctx))
        .post('/api/auth/login')
        .send({ identifier: 'ada@acme.test', password: 'Passw0rd!' })
        .expect(200);

      expect(res.body).toEqual({
        success: true,
        message: 'Signed in successfully.',
        data: {
          // Access token only. The refresh token is deliberately NOT here —
          // returning it in the body is what let the client write it to
          // localStorage, where any injected script could read it.
          accessToken: expect.any(String),
        },
      });
    });

    it('puts the refresh token in an httpOnly cookie, not the body', async () => {
      const res = await request(httpServer(ctx))
        .post('/api/auth/login')
        .send({ identifier: 'ada@acme.test', password: 'Passw0rd!' })
        .expect(200);

      const cookie = (res.headers['set-cookie'] as unknown as string[]).find(
        (c) => c.startsWith('sbt_refresh='),
      );

      expect(cookie).toBeDefined();
      // HttpOnly is the whole mechanism: without it a script can read the
      // token and the move out of localStorage bought nothing.
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      // Scoped to the auth routes, so it never rides along on a data request.
      expect(cookie).toMatch(/Path=\/api\/auth/i);
    });

    it('sets the security headers helmet is here for', async () => {
      const res = await request(httpServer(ctx)).get('/api').expect(200);

      // HSTS is the one that mattered: it stops a browser ever talking to this
      // API over plain HTTP again.
      expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
      // What actually prevents a JSON response being sniffed as HTML.
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
      // Deliberately absent — it only breaks the Swagger UI here. See
      // app.setup.ts for the reasoning.
      expect(res.headers['content-security-policy']).toBeUndefined();
      // Express's giveaway banner.
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('wraps validation failures with a flat message and a details array', async () => {
      const res = await request(httpServer(ctx))
        .post('/api/auth/login')
        .send({})
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(typeof res.body.message).toBe('string');
      expect(Array.isArray(res.body.error.details)).toBe(true);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('rejects unknown fields rather than silently ignoring them', async () => {
      // forbidNonWhitelisted — stops a caller smuggling e.g. organizationId.
      await request(httpServer(ctx))
        .post('/api/auth/login')
        .send({
          identifier: 'ada@acme.test',
          password: 'Passw0rd!',
          role: 'SUPER_ADMIN',
        })
        .expect(400);
    });

    it('returns 401 with the envelope when no token is supplied', async () => {
      const res = await request(httpServer(ctx))
        .get('/api/auth/me')
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('resending organization verification', () => {
    const pendingEmail = 'newco@test.local';

    const startSignup = () =>
      request(httpServer(ctx))
        .post('/api/auth/register-organization')
        .send({ email: pendingEmail, password: 'Passw0rd!' })
        .expect(201);

    it('answers identically for a pending signup and an unknown email', async () => {
      await startSignup();

      const known = await request(httpServer(ctx))
        .post('/api/auth/resend-organization-verification')
        .send({ email: pendingEmail })
        .expect(200);

      const unknown = await request(httpServer(ctx))
        .post('/api/auth/resend-organization-verification')
        .send({ email: 'nobody@test.local' })
        .expect(200);

      expect(known.body.message).toBe(unknown.body.message);
    });

    it('sends a new link and retires the previous one', async () => {
      await startSignup();
      const first = ctx.mail.tokenFor(pendingEmail);

      await request(httpServer(ctx))
        .post('/api/auth/resend-organization-verification')
        .send({ email: pendingEmail })
        .expect(200);

      const second = ctx.mail.tokenFor(pendingEmail);
      expect(second).not.toBe(first);

      // The superseded link must be dead, not merely duplicated.
      await request(httpServer(ctx))
        .post('/api/auth/verify-organization')
        .send({
          token: first,
          organizationName: 'New Co',
          adminName: 'New Admin',
          industry: 'Technology',
        })
        .expect(400);

      await request(httpServer(ctx))
        .post('/api/auth/verify-organization')
        .send({
          token: second,
          organizationName: 'New Co',
          adminName: 'New Admin',
          industry: 'Technology',
        })
        .expect(200);
    });

    it('sends nothing for an email with no pending signup', async () => {
      // beforeEach already registers Acme, so count the delta rather than
      // expecting an empty log.
      const before = ctx.mail.sent.length;

      await request(httpServer(ctx))
        .post('/api/auth/resend-organization-verification')
        .send({ email: 'nobody@test.local' })
        .expect(200);

      expect(ctx.mail.sent).toHaveLength(before);
    });
  });

  /**
   * PATCH /api/users/:id (#30) and POST /api/users/:id/reinstate (#23).
   *
   * Both were added on 25 Sep 2026, and between them they close the user
   * lifecycle, which until now only ran forwards: provision, suspend, delete,
   * and no way back or sideways.
   *
   * The unit tests cover the branches. What only e2e can show is that the
   * guards survive the real request pipeline — the roles decorator, the UUID
   * pipe, the validation pipe and the transaction — and that a role change
   * genuinely ends the demoted session rather than merely marking a row.
   */
  describe('editing a user (#30)', () => {
    it('requires authentication', async () => {
      const emp = await ctx.prisma.user.findFirst({ where: { role: 'EMPLOYEE' } });
      await request(httpServer(ctx))
        .patch(`/api/users/${emp?.id ?? '00000000-0000-0000-0000-000000000000'}`)
        .send({ name: 'Nope' })
        .expect(401);
    });

    it('changes a name and records the before and after in the audit trail', async () => {
      await onboard('EMPLOYEE', 'edit1');
      const user = await ctx.prisma.user.findUnique({
        where: { email: 'edit1@acme.test' },
      });

      const res = await request(httpServer(ctx))
        .patch(`/api/users/${user?.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Renamed Person' })
        .expect(200);

      expect(res.body.data.name).toBe('Renamed Person');

      const entry = await ctx.prisma.auditLog.findFirst({
        where: { action: 'USER_UPDATED', targetId: user?.id },
        orderBy: { createdAt: 'desc' },
      });

      // The row now holds the new name, so without this the trail could not
      // say what it used to be — which is the whole question in a dispute.
      expect(entry).not.toBeNull();
      expect(entry?.targetLabel).toContain('"User edit1" to "Renamed Person"');
    });

    it('assigns a department to someone the setup wizard left unassigned', async () => {
      // The concrete gap #30 was raised for. The wizard's invite step collects
      // name, email and role only, so everyone onboarded during setup had no
      // department and no route to being given one — and a TEAM_LEAD's entire
      // data scope keys off departmentId.
      await onboard('EMPLOYEE', 'edit2');
      const user = await ctx.prisma.user.findUnique({
        where: { email: 'edit2@acme.test' },
      });
      expect(user?.departmentId).toBeNull();

      const dept = await ctx.prisma.department.create({
        data: { name: 'Field Ops', organizationId: user!.organizationId },
      });

      await request(httpServer(ctx))
        .patch(`/api/users/${user?.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ departmentId: dept.id })
        .expect(200);

      const after = await ctx.prisma.user.findUnique({ where: { id: user?.id } });
      expect(after?.departmentId).toBe(dept.id);
    });

    it('clears a department when sent null', async () => {
      await onboard('EMPLOYEE', 'edit3');
      const user = await ctx.prisma.user.findUnique({
        where: { email: 'edit3@acme.test' },
      });
      const dept = await ctx.prisma.department.create({
        data: { name: 'Temporary', organizationId: user!.organizationId },
      });

      await request(httpServer(ctx))
        .patch(`/api/users/${user?.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ departmentId: dept.id })
        .expect(200);

      await request(httpServer(ctx))
        .patch(`/api/users/${user?.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ departmentId: null })
        .expect(200);

      const after = await ctx.prisma.user.findUnique({ where: { id: user?.id } });
      expect(after?.departmentId).toBeNull();
    });

    it('signs out a demoted user immediately', async () => {
      // The part that only a live request can prove. The role is baked into
      // the access token, so a demotion that does not revoke sessions leaves
      // administrative access working for as long as the browser stays open.
      const hrToken = await onboard('HR_ADMIN', 'demote');
      const hr = await ctx.prisma.user.findUnique({
        where: { email: 'demote@acme.test' },
      });

      // Working as an HR admin before.
      await request(httpServer(ctx))
        .get('/api/users')
        .set('Authorization', `Bearer ${hrToken}`)
        .expect(200);

      await request(httpServer(ctx))
        .patch(`/api/users/${hr?.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'EMPLOYEE' })
        .expect(200);

      // The access token still says HR_ADMIN, but JwtStrategy re-reads the
      // user on every request, so the new role applies at once.
      await request(httpServer(ctx))
        .get('/api/users')
        .set('Authorization', `Bearer ${hrToken}`)
        .expect(403);

      // And the refresh token is gone, so they cannot mint a fresh one.
      const liveSessions = await ctx.prisma.refreshToken.count({
        where: { userId: hr?.id, revoked: false },
      });
      expect(liveSessions).toBe(0);
    });

    it('stops an HR_ADMIN promoting anyone to SUPER_ADMIN', async () => {
      const hrToken = await onboard('HR_ADMIN', 'ceiling');
      await onboard('EMPLOYEE', 'target1');
      const target = await ctx.prisma.user.findUnique({
        where: { email: 'target1@acme.test' },
      });

      await request(httpServer(ctx))
        .patch(`/api/users/${target?.id}`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ role: 'SUPER_ADMIN' })
        .expect(403);

      const after = await ctx.prisma.user.findUnique({ where: { id: target?.id } });
      expect(after?.role).toBe('EMPLOYEE');
    });

    it('refuses an EMPLOYEE outright', async () => {
      const empToken = await onboard('EMPLOYEE', 'nobody');
      await onboard('EMPLOYEE', 'target2');
      const target = await ctx.prisma.user.findUnique({
        where: { email: 'target2@acme.test' },
      });

      await request(httpServer(ctx))
        .patch(`/api/users/${target?.id}`)
        .set('Authorization', `Bearer ${empToken}`)
        .send({ name: 'Hacked' })
        .expect(403);
    });

    it('rejects an empty patch rather than writing a pointless audit row', async () => {
      await onboard('EMPLOYEE', 'edit4');
      const user = await ctx.prisma.user.findUnique({
        where: { email: 'edit4@acme.test' },
      });

      await request(httpServer(ctx))
        .patch(`/api/users/${user?.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);
    });

    it('rejects a malformed department id instead of clearing the column', async () => {
      // ValidateIf skips the UUID check only for exactly null. An empty string
      // must not be read as "clear it".
      await onboard('EMPLOYEE', 'edit5');
      const user = await ctx.prisma.user.findUnique({
        where: { email: 'edit5@acme.test' },
      });

      await request(httpServer(ctx))
        .patch(`/api/users/${user?.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ departmentId: 'not-a-uuid' })
        .expect(400);
    });

    it('will not let an admin edit their own account', async () => {
      const admin = await ctx.prisma.user.findFirst({
        where: { role: 'SUPER_ADMIN' },
      });

      await request(httpServer(ctx))
        .patch(`/api/users/${admin?.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'EMPLOYEE' })
        .expect(400);
    });
  });

  describe('reinstating a removed employee (#23)', () => {
    /** Onboards someone, then removes them. Returns the row. */
    const onboardAndRemove = async (suffix: string) => {
      await onboard('EMPLOYEE', suffix);
      const user = await ctx.prisma.user.findUnique({
        where: { email: `${suffix}@acme.test` },
      });

      await request(httpServer(ctx))
        .delete(`/api/users/${user?.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      return user!;
    };

    it('brings the person back as PENDING with a fresh invitation', async () => {
      const user = await onboardAndRemove('back1');

      const res = await request(httpServer(ctx))
        .post(`/api/users/${user.id}/reinstate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.status).toBe('PENDING');

      const after = await ctx.prisma.user.findUnique({ where: { id: user.id } });
      expect(after?.status).toBe('PENDING');
      expect(after?.deletedAt).toBeNull();

      // A fresh invitation, not the old one — DELETE spent every live token.
      const liveInvites = await ctx.prisma.activationToken.count({
        where: { userId: user.id, usedAt: null },
      });
      expect(liveInvites).toBe(1);
    });

    it('destroys the old password, so the invitation cannot be ignored', async () => {
      const user = await onboardAndRemove('back2');

      await request(httpServer(ctx))
        .post(`/api/users/${user.id}/reinstate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // The decision was "fresh invitation". If the old credential survived,
      // a returning employee could skip the email and sign in with a password
      // set before they left — which is the outcome it explicitly rejected.
      await request(httpServer(ctx))
        .post('/api/auth/login')
        .send({ identifier: 'back2@acme.test', password: 'Passw0rd!' })
        .expect(401);

      const after = await ctx.prisma.user.findUnique({ where: { id: user.id } });
      expect(after?.passwordHash).toBeNull();
    });

    it('lets the returning employee activate and sign in again', async () => {
      // The end-to-end point of the feature: re-hiring works.
      const user = await onboardAndRemove('back3');

      await request(httpServer(ctx))
        .post(`/api/users/${user.id}/reinstate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(httpServer(ctx))
        .post('/api/auth/complete-registration')
        .send({
          token: ctx.mail.tokenFor('back3@acme.test', 'activation'),
          password: 'NewPassw0rd!',
          confirmPassword: 'NewPassw0rd!',
        })
        .expect(200);

      await request(httpServer(ctx))
        .post('/api/auth/login')
        .send({ identifier: 'back3@acme.test', password: 'NewPassw0rd!' })
        .expect(200);
    });

    it('frees the email address that the removal had reserved', async () => {
      // The blockage #23 described: the soft-deleted row keeps the address, so
      // re-inviting the same person hit the duplicate-email guard.
      const user = await onboardAndRemove('back4');

      await request(httpServer(ctx))
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Returning Person',
          email: 'back4@acme.test',
          role: 'EMPLOYEE',
        })
        .expect(400);

      await request(httpServer(ctx))
        .post(`/api/users/${user.id}/reinstate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Now the address belongs to a live account again — the same one.
      const after = await ctx.prisma.user.findUnique({ where: { id: user.id } });
      expect(after?.email).toBe('back4@acme.test');
      expect(after?.status).toBe('PENDING');
    });

    it('refuses an HR_ADMIN, per the 24 Sep decision', async () => {
      const hrToken = await onboard('HR_ADMIN', 'hrback');
      const user = await onboardAndRemove('back5');

      await request(httpServer(ctx))
        .post(`/api/users/${user.id}/reinstate`)
        .set('Authorization', `Bearer ${hrToken}`)
        .expect(403);

      const after = await ctx.prisma.user.findUnique({ where: { id: user.id } });
      expect(after?.status).toBe('DELETED');
    });

    it('refuses a user who was never removed', async () => {
      await onboard('EMPLOYEE', 'active1');
      const user = await ctx.prisma.user.findUnique({
        where: { email: 'active1@acme.test' },
      });

      // Reinstating somebody who is already active would wipe their password
      // and sign them out for no reason.
      await request(httpServer(ctx))
        .post(`/api/users/${user?.id}/reinstate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('writes USER_REINSTATED, not USER_RESTORED', async () => {
      const user = await onboardAndRemove('back6');

      await request(httpServer(ctx))
        .post(`/api/users/${user.id}/reinstate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const entry = await ctx.prisma.auditLog.findFirst({
        where: { targetId: user.id, action: 'USER_REINSTATED' },
      });

      expect(entry).not.toBeNull();
      // Un-suspending and bringing somebody back from removal are events of
      // very different weight, and the trail has to tell them apart.
      expect(entry?.targetLabel).toContain('EMP-back6');
    });

    it('requires authentication', async () => {
      const user = await onboardAndRemove('back7');

      await request(httpServer(ctx))
        .post(`/api/users/${user.id}/reinstate`)
        .expect(401);
    });
  });

});
