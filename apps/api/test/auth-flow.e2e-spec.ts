import request from 'supertest';
import {
  createTestApp,
  httpServer,
  registerOrganization,
  TestContext,
} from './helpers/test-app';

describe('Auth flow and RBAC (integration)', () => {
  let ctx: TestContext;
  let adminToken: string;
  let adminRefresh: string;

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
  });

  afterAll(async () => {
    await ctx.close();
  });

  /** Provisions a user and completes their registration; returns their token. */
  const onboard = async (role: string, suffix: string) => {
    const provisioned = await request(httpServer(ctx))
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
        token: provisioned.body.data.activationToken,
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
          token: provisioned.body.data.activationToken,
          password: 'Passw0rd!',
          confirmPassword: 'Passw0rd!',
        })
        .expect(200);

      user = await ctx.prisma.user.findUnique({ where: { id: userId } });
      expect(user?.status).toBe('ACTIVE');
      expect(user?.passwordHash).toEqual(expect.any(String));
    });

    it('refuses to reuse an activation token', async () => {
      const provisioned = await request(httpServer(ctx))
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeId: 'EMP-101',
          name: 'Carol',
          email: 'carol@acme.test',
          role: 'EMPLOYEE',
        })
        .expect(201);

      const token = provisioned.body.data.activationToken;

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
        .send({ identifier: 'SA001', password: 'Passw0rd!' })
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

  describe('refresh rotation', () => {
    it('rejects a refresh token that has already been rotated', async () => {
      await request(httpServer(ctx))
        .post('/api/auth/refresh')
        .send({ refreshToken: adminRefresh })
        .expect(200);

      // Replay of the now-revoked token.
      await request(httpServer(ctx))
        .post('/api/auth/refresh')
        .send({ refreshToken: adminRefresh })
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

      const tokens = [
        first.body.data.refreshToken,
        second.body.data.refreshToken,
        third.body.data.refreshToken,
      ];
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
      const forgot = await request(httpServer(ctx))
        .post('/api/auth/forgot-password')
        .send({ email: 'ada@acme.test' })
        .expect(200);

      await request(httpServer(ctx))
        .post('/api/auth/reset-password')
        .send({
          token: forgot.body.data.resetToken,
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
      const forgot = await request(httpServer(ctx))
        .post('/api/auth/forgot-password')
        .send({ email: 'ada@acme.test' })
        .expect(200);

      const body = {
        token: forgot.body.data.resetToken,
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
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
        },
      });
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
});
