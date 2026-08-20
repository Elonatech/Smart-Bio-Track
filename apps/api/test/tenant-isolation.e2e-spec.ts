import request from 'supertest';
import { createTestApp, httpServer, TestContext } from './helpers/test-app';

/**
 * The most important guarantee in the product: one company cannot see, alter,
 * or delete another company's records.
 *
 * This defect appeared independently in both the Departments and the Offices
 * module during Phase 2. Unit tests with a mocked Prisma can only assert that
 * a `where` clause was *passed*; these assert the isolation actually holds
 * against real rows.
 */
describe('Tenant isolation (integration)', () => {
  let ctx: TestContext;

  let acmeToken: string;
  let globexToken: string;
  let acmeDeptId: string;
  let acmeOfficeId: string;

  const registerOrg = async (name: string, suffix: string) => {
    const res = await request(httpServer(ctx))
      .post('/api/auth/register-organization')
      .send({
        organizationName: name,
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

    acmeToken = await registerOrg('Acme Corp', 'acme');
    globexToken = await registerOrg('Globex Inc', 'globex');

    const dept = await request(httpServer(ctx))
      .post('/api/departments')
      .set('Authorization', `Bearer ${acmeToken}`)
      .send({ name: 'Acme Engineering' })
      .expect(201);
    acmeDeptId = dept.body.data.id;

    const office = await request(httpServer(ctx))
      .post('/api/offices')
      .set('Authorization', `Bearer ${acmeToken}`)
      .send({ name: 'Acme HQ', latitude: 6.5244, longitude: 3.3792 })
      .expect(201);
    acmeOfficeId = office.body.data.id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('departments', () => {
    it("does not list another organization's departments", async () => {
      const res = await request(httpServer(ctx))
        .get('/api/departments')
        .set('Authorization', `Bearer ${globexToken}`)
        .expect(200);

      expect(res.body.data).toEqual([]);
    });

    it('returns 404 — not 403 — when reading across tenants', async () => {
      const res = await request(httpServer(ctx))
        .get(`/api/departments/${acmeDeptId}`)
        .set('Authorization', `Bearer ${globexToken}`)
        .expect(404);

      // 404 rather than 403 on purpose: 403 would confirm the record exists.
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it("refuses to update another organization's department", async () => {
      await request(httpServer(ctx))
        .put(`/api/departments/${acmeDeptId}`)
        .set('Authorization', `Bearer ${globexToken}`)
        .send({ name: 'Hijacked' })
        .expect(404);

      const unchanged = await ctx.prisma.department.findUnique({
        where: { id: acmeDeptId },
      });
      expect(unchanged?.name).toBe('Acme Engineering');
    });

    it("refuses to delete another organization's department", async () => {
      await request(httpServer(ctx))
        .delete(`/api/departments/${acmeDeptId}`)
        .set('Authorization', `Bearer ${globexToken}`)
        .expect(404);

      expect(
        await ctx.prisma.department.findUnique({ where: { id: acmeDeptId } }),
      ).not.toBeNull();
    });
  });

  describe('offices', () => {
    it("does not list another organization's offices", async () => {
      const res = await request(httpServer(ctx))
        .get('/api/offices')
        .set('Authorization', `Bearer ${globexToken}`)
        .expect(200);

      expect(res.body.data).toEqual([]);
    });

    it('returns 404 when reading across tenants', async () => {
      await request(httpServer(ctx))
        .get(`/api/offices/${acmeOfficeId}`)
        .set('Authorization', `Bearer ${globexToken}`)
        .expect(404);
    });

    it("refuses to delete another organization's office", async () => {
      await request(httpServer(ctx))
        .delete(`/api/offices/${acmeOfficeId}`)
        .set('Authorization', `Bearer ${globexToken}`)
        .expect(404);

      expect(
        await ctx.prisma.office.findUnique({ where: { id: acmeOfficeId } }),
      ).not.toBeNull();
    });
  });

  describe('users', () => {
    it("does not list another organization's users", async () => {
      const res = await request(httpServer(ctx))
        .get('/api/users')
        .set('Authorization', `Bearer ${globexToken}`)
        .expect(200);

      // Globex sees only its own admin.
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].email).toBe('adminglobex@test.local');
    });

    it("cannot provision a user into another organization's department", async () => {
      const res = await request(httpServer(ctx))
        .post('/api/users')
        .set('Authorization', `Bearer ${globexToken}`)
        .send({
          employeeId: 'GLOBEX-001',
          name: 'Sneaky',
          email: 'sneaky@test.local',
          role: 'EMPLOYEE',
          departmentId: acmeDeptId, // belongs to Acme
        })
        .expect(400);

      expect(res.body.message).toMatch(/department/i);
    });

    it("cannot provision a user into another organization's office", async () => {
      await request(httpServer(ctx))
        .post('/api/users')
        .set('Authorization', `Bearer ${globexToken}`)
        .send({
          employeeId: 'GLOBEX-002',
          name: 'Sneaky Two',
          email: 'sneaky2@test.local',
          role: 'EMPLOYEE',
          officeId: acmeOfficeId,
        })
        .expect(400);
    });

    it("scopes a provisioned user to the caller's organization, not one they name", async () => {
      const res = await request(httpServer(ctx))
        .post('/api/users')
        .set('Authorization', `Bearer ${globexToken}`)
        .send({
          employeeId: 'GLOBEX-003',
          name: 'Legit',
          email: 'legit@test.local',
          role: 'EMPLOYEE',
        })
        .expect(201);

      const created = await ctx.prisma.user.findUnique({
        where: { id: res.body.data.id },
        include: { organization: true },
      });
      expect(created?.organization.name).toBe('Globex Inc');
    });
  });
});
