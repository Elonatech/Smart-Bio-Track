import request from 'supertest';
import { createTestApp, httpServer, TestContext } from './helpers/test-app';

/**
 * The only spec that runs with ThrottlerGuard enabled — everywhere else it is
 * stubbed out, or every suite would start failing on its sixth request for
 * reasons unrelated to what it is testing.
 */
describe('Rate limiting (integration)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp({ throttling: true });
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('allows 5 login attempts per minute, then returns 429', async () => {
    const attempt = () =>
      request(httpServer(ctx))
        .post('/api/auth/login')
        .send({ identifier: 'nobody@test.local', password: 'Wrong123!' });

    for (let i = 0; i < 5; i++) {
      await attempt().expect(401);
    }

    const blocked = await attempt().expect(429);

    expect(blocked.body.success).toBe(false);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
    // Must not leak the exception class name (PRTS §A11).
    expect(blocked.body.message).not.toMatch(/ThrottlerException/);
  });

  it('does not apply the tight auth limit to ordinary routes', async () => {
    // Regression guard: registering a second named throttler globally once
    // rate-limited the entire API at 5/min, including plain GETs.
    for (let i = 0; i < 8; i++) {
      await request(httpServer(ctx)).get('/api').expect(200);
    }
  });
});
