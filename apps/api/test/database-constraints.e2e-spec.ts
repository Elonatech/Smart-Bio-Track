import request from 'supertest';
import { createTestApp, httpServer, TestContext } from './helpers/test-app';

/**
 * Verifies behaviour that the unit tests cannot see, because they mock
 * PrismaService: the constraints and cascades declared in schema.prisma are
 * only enforced by Postgres itself.
 */
describe('Database constraints (integration)', () => {
  let ctx: TestContext;

  const org = async (suffix: string) => {
    const res = await request(httpServer(ctx))
      .post('/api/auth/register-organization')
      .send({
        organizationName: `Org ${suffix}`,
        adminEmployeeId: `ADMIN-${suffix}`,
        adminName: `Admin ${suffix}`,
        email: `admin${suffix}@test.local`,
        password: 'Passw0rd!',
        confirmPassword: 'Passw0rd!',
      })
      .expect(201);
    return res.body.data.accessToken as string;
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
    it('rejects a second organization registering with a taken email', async () => {
      await org('a');

      const res = await request(httpServer(ctx))
        .post('/api/auth/register-organization')
        .send({
          organizationName: 'Different Org',
          adminEmployeeId: 'DIFFERENT-ID',
          adminName: 'Someone Else',
          email: 'admina@test.local', // already taken by org('a')
          password: 'Passw0rd!',
          confirmPassword: 'Passw0rd!',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
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
          token: provisioned.body.data.activationToken,
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
      await org('a');

      const before = await ctx.prisma.organization.count();

      // Fails at user creation (email taken) *after* the organization insert
      // inside the same $transaction — so the org must not survive.
      await request(httpServer(ctx))
        .post('/api/auth/register-organization')
        .send({
          organizationName: 'Should Not Persist',
          adminEmployeeId: 'ROLLBACK-001',
          adminName: 'Rollback',
          email: 'admina@test.local',
          password: 'Passw0rd!',
          confirmPassword: 'Passw0rd!',
        })
        .expect(400);

      expect(await ctx.prisma.organization.count()).toBe(before);
      expect(
        await ctx.prisma.organization.findUnique({
          where: { name: 'Should Not Persist' },
        }),
      ).toBeNull();
    });
  });
});
