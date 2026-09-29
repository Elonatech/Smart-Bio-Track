import request from 'supertest';
import { createTestApp, httpServer, TestContext } from './helpers/test-app';

describe('AppController (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('GET /api returns the greeting inside the success envelope', () => {
    return request(httpServer(ctx)).get('/api').expect(200).expect({
      success: true,
      message: 'Request successful.',
      data: 'Hello World!',
    });
  });

  it('GET /api/health/db reports a live database connection', async () => {
    const res = await request(httpServer(ctx))
      .get('/api/health/db')
      .expect(200);
    expect(res.body.success).toBe(true);
  });
});
