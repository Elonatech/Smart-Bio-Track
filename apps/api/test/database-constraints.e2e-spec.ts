import { randomBytes, randomUUID } from 'crypto';
import request from 'supertest';
import {
  createTestApp,
  httpServer,
  registerOrganization,
  TestContext,
} from './helpers/test-app';
import { TokenCleanupService } from '../src/maintenance/token-cleanup.service';

/**
 * Verifies behaviour that the unit tests cannot see, because they mock
 * PrismaService: the constraints and cascades declared in schema.prisma are
 * only enforced by Postgres itself.
 */
describe('Database constraints (integration)', () => {
  let ctx: TestContext;

  const org = async (suffix: string) => {
    const { accessToken } = await registerOrganization(ctx, {
      organizationName: `Org ${suffix}`,
      email: `admin${suffix}@test.local`,
      adminName: `Admin ${suffix}`,
    });
    return accessToken;
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

  describe('@@unique([organizationId, name])', () => {
    it('rejects a duplicate department name within one organization', async () => {
      const token = await org('a');

      await request(httpServer(ctx))
        .post('/api/departments')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Engineering' })
        .expect(201);

      const res = await request(httpServer(ctx))
        .post('/api/departments')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Engineering' })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('allows the same department name in two different organizations', async () => {
      const tokenA = await org('a');
      const tokenB = await org('b');

      await request(httpServer(ctx))
        .post('/api/departments')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Engineering' })
        .expect(201);

      // The whole point of scoping uniqueness per organization.
      await request(httpServer(ctx))
        .post('/api/departments')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'Engineering' })
        .expect(201);
    });

    it('rejects a duplicate office name within one organization', async () => {
      const token = await org('a');
      const office = {
        name: 'Headquarters',
        latitude: 6.5244,
        longitude: 3.3792,
      };

      await request(httpServer(ctx))
        .post('/api/offices')
        .set('Authorization', `Bearer ${token}`)
        .send(office)
        .expect(201);

      // Reaches Prisma's P2002 handler, which was unreachable dead code until
      // the unique constraint was added on 13 Aug.
      const res = await request(httpServer(ctx))
        .post('/api/offices')
        .set('Authorization', `Bearer ${token}`)
        .send(office)
        .expect(409);

      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('global uniqueness on User', () => {
    it('will not let a taken email be registered again, and will not say so', async () => {
      await org('a');
      ctx.mail.clear();

      const taken = 'admina@test.local'; // already held by org('a')

      const res = await request(httpServer(ctx))
        .post('/api/auth/register-organization')
        .send({ email: taken, password: 'Passw0rd!' })
        .expect(201);

      // Indistinguishable from a fresh signup on purpose. This endpoint is
      // public and unauthenticated, so a 400 here let anyone test which
      // addresses have accounts — for an attendance product, that is a list of
      // who works for our customers.
      expect(res.body.success).toBe(true);

      // The truth goes to the inbox instead, where only its owner reads it.
      // Critically it is NOT a verification link: a second signup must not be
      // able to start over an address somebody already owns.
      expect(ctx.mail.kindsSentTo(taken)).toEqual(['already-exists']);

      // And nothing was written — no pending signup now claims that address.
      const pending = await ctx.prisma.pendingOrganizationSignup.findUnique({
        where: { email: taken },
      });
      expect(pending).toBeNull();
    });

    it('answers a free address and a taken one identically', async () => {
      await org('a');
      ctx.mail.clear();

      const takenRes = await request(httpServer(ctx))
        .post('/api/auth/register-organization')
        .send({ email: 'admina@test.local', password: 'Passw0rd!' })
        .expect(201);

      const freeRes = await request(httpServer(ctx))
        .post('/api/auth/register-organization')
        .send({ email: 'nobody@test.local', password: 'Passw0rd!' })
        .expect(201);

      // Byte-identical bodies. A difference in wording, field order or status
      // is all an enumeration attack needs.
      expect(takenRes.body).toEqual(freeRes.body);
    });

    it('rejects a duplicate employeeId across organizations', async () => {
      const tokenA = await org('a');
      const tokenB = await org('b');

      await request(httpServer(ctx))
        .post('/api/users')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          employeeId: 'SHARED-001',
          name: 'First',
          email: 'first@test.local',
          role: 'EMPLOYEE',
        })
        .expect(201);

      // employeeId is globally unique, not per-organization — a deliberate
      // simplification recorded in ENGINEERING_REFERENCE §4.
      await request(httpServer(ctx))
        .post('/api/users')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          employeeId: 'SHARED-001',
          name: 'Second',
          email: 'second@test.local',
          role: 'EMPLOYEE',
        })
        .expect(400);
    });
  });

  describe('cascade deletes', () => {
    it("removes a user's tokens when the user is deleted", async () => {
      const token = await org('a');

      const provisioned = await request(httpServer(ctx))
        .post('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          employeeId: 'EMP-CASCADE',
          name: 'Cascade Test',
          email: 'cascade@test.local',
          role: 'EMPLOYEE',
        })
        .expect(201);

      const userId = provisioned.body.data.id as string;

      // Activate, so the user has a refresh token as well as an activation one.
      await request(httpServer(ctx))
        .post('/api/auth/complete-registration')
        .send({
          token: ctx.mail.tokenFor('cascade@test.local', 'activation'),
          password: 'Passw0rd!',
          confirmPassword: 'Passw0rd!',
        })
        .expect(200);

      expect(
        await ctx.prisma.activationToken.count({ where: { userId } }),
      ).toBe(1);
      expect(await ctx.prisma.refreshToken.count({ where: { userId } })).toBe(
        1,
      );

      await ctx.prisma.user.delete({ where: { id: userId } });

      // onDelete: Cascade — enforced by Postgres, invisible to mocked tests.
      expect(
        await ctx.prisma.activationToken.count({ where: { userId } }),
      ).toBe(0);
      expect(await ctx.prisma.refreshToken.count({ where: { userId } })).toBe(
        0,
      );
    });
  });

  describe('transaction rollback', () => {
    it('creates no organization when the admin user cannot be created', async () => {
      const email = 'rollback@test.local';

      // Step one passes cleanly: nothing holds this email yet.
      await request(httpServer(ctx))
        .post('/api/auth/register-organization')
        .send({ email, password: 'Passw0rd!' })
        .expect(201);

      const token = ctx.mail.tokenFor(email);

      // Between the two steps, that email gets taken by a user elsewhere.
      // Seeded directly because the API deliberately makes this unreachable —
      // the point is what Postgres does if it happens anyway.
      const other = await ctx.prisma.organization.create({
        data: { name: 'Other Org', email: 'other@test.local' },
      });
      await ctx.prisma.user.create({
        data: {
          employeeId: 'OTHER-001',
          name: 'Someone Else',
          email,
          organizationId: other.id,
          role: 'EMPLOYEE',
          status: 'ACTIVE',
        },
      });

      const before = await ctx.prisma.organization.count();

      // Fails at user creation (email taken) *after* the organization insert
      // inside the same $transaction — so the org must not survive.
      await request(httpServer(ctx))
        .post('/api/auth/verify-organization')
        .send({
          token,
          organizationName: 'Should Not Persist',
          adminName: 'Rollback',
          industry: 'Technology',
        })
        .expect(409);

      expect(await ctx.prisma.organization.count()).toBe(before);
      // findFirst, not findUnique: the organization name stopped being a unique
      // key, so Prisma no longer accepts it as one.
      expect(
        await ctx.prisma.organization.findFirst({
          where: { name: 'Should Not Persist' },
        }),
      ).toBeNull();
    });

    it('lets two organizations register under the same name', async () => {
      // Duplicate company names are ordinary, and the first registrant used to
      // take the name from everyone else worldwide. Tenants are addressed by
      // id, never see each other, and sign in by email or employee ID — so
      // nothing here needed the name to be a key.
      const shared = 'Sterling Ltd';

      await registerOrganization(ctx, {
        organizationName: shared,
        email: 'first@sterling.test',
      });
      await registerOrganization(ctx, {
        organizationName: shared,
        email: 'second@sterling.test',
      });

      expect(
        await ctx.prisma.organization.count({ where: { name: shared } }),
      ).toBe(2);
    });
  });

  describe('token cleanup sweep', () => {
    /**
     * The unit tests for TokenCleanupService mock PrismaService completely, so
     * a misspelled column or a `where` shape Prisma rejects would pass every
     * one of them. These run the real queries against real Postgres.
     */
    const sweep = () => ctx.app.get(TokenCleanupService);

    const seedRefreshToken = async (
      userId: string,
      overrides: { expiresAt: Date; revoked?: boolean; rotatedAt?: Date },
    ) =>
      ctx.prisma.refreshToken.create({
        data: {
          tokenHash: randomBytes(32).toString('hex'),
          userId,
          familyId: randomUUID(),
          expiresAt: overrides.expiresAt,
          revoked: overrides.revoked ?? false,
          rotatedAt: overrides.rotatedAt ?? null,
        },
      });

    it('deletes expired tokens and leaves live ones alone', async () => {
      await org('sweep');
      const admin = await ctx.prisma.user.findUnique({
        where: { email: 'adminsweep@test.local' },
      });

      const expired = await seedRefreshToken(admin!.id, {
        expiresAt: new Date(Date.now() - 60_000),
      });
      const live = await seedRefreshToken(admin!.id, {
        expiresAt: new Date(Date.now() + 60 * 60_000),
      });

      const result = await sweep().cleanupExpiredTokens();

      expect(result.refreshTokens).toBeGreaterThanOrEqual(1);
      expect(
        await ctx.prisma.refreshToken.findUnique({ where: { id: expired.id } }),
      ).toBeNull();
      expect(
        await ctx.prisma.refreshToken.findUnique({ where: { id: live.id } }),
      ).not.toBeNull();
    });

    it('keeps a revoked token that has not expired, so theft detection survives', async () => {
      // The load-bearing case. A spent token must stay findable until it
      // expires: if the sweep took revoked rows early, a replay would read as
      // an unknown token — a plain 401 with no family revocation — and the
      // thief's own session would outlive the detection that exists to kill it.
      await org('sweep2');
      const admin = await ctx.prisma.user.findUnique({
        where: { email: 'adminsweep2@test.local' },
      });

      const spent = await seedRefreshToken(admin!.id, {
        expiresAt: new Date(Date.now() + 60 * 60_000),
        revoked: true,
        rotatedAt: new Date(Date.now() - 10 * 60_000),
      });

      await sweep().cleanupExpiredTokens();

      expect(
        await ctx.prisma.refreshToken.findUnique({ where: { id: spent.id } }),
      ).not.toBeNull();
    });
  });
});
