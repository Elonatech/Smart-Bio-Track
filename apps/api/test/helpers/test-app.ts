import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MailService } from '../../src/mail/mail.service';
import { createTestPrismaClient, truncateAll } from './database';

/**
 * Stands in for MailService and records what would have been sent.
 *
 * This is not only about avoiding real network calls. Verification and
 * activation tokens are stored as SHA-256 hashes and returned to the caller
 * exactly once — through the email — so once the token stopped coming back in
 * the HTTP response there was no way for a test to complete a signup at all.
 * Capturing the send is that missing seam.
 */
type SentKind = 'verification' | 'activation' | 'reset';

export class FakeMailService {
  readonly sent: Array<{ kind: SentKind; email: string; token: string }> = [];

  sendEmail(): Promise<void> {
    return Promise.resolve();
  }

  sendOrganizationVerificationEmail(
    email: string,
    token: string,
  ): Promise<void> {
    this.sent.push({ kind: 'verification', email, token });
    return Promise.resolve();
  }

  sendActivationEmail(email: string, token: string): Promise<void> {
    this.sent.push({ kind: 'activation', email, token });
    return Promise.resolve();
  }

  sendPasswordResetEmail(email: string, token: string): Promise<void> {
    this.sent.push({ kind: 'reset', email, token });
    return Promise.resolve();
  }

  clear(): void {
    this.sent.length = 0;
  }

  /** The most recent token of `kind` sent to `email`. */
  tokenFor(email: string, kind: SentKind = 'verification'): string {
    const match = [...this.sent]
      .reverse()
      .find((s) => s.kind === kind && s.email === email.toLowerCase());

    if (!match) {
      throw new Error(`No ${kind} email was sent to ${email}`);
    }

    return match.token;
  }
}

export interface TestContext {
  app: INestApplication;
  prisma: PrismaClient;
  mail: FakeMailService;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Boots the real application against the test database.
 *
 * Two deliberate substitutions:
 *
 *  - `PrismaService` is replaced with a client pointed at TEST_DATABASE_URL,
 *    so nothing can reach the development database even by accident.
 *  - Rate limiting is switched off unless a suite asks for it. Limits are
 *    verified in rate-limiting.e2e-spec; leaving them on everywhere makes
 *    every other suite fail for unrelated reasons — `register-organization`
 *    alone is capped at 3/hour and the counter is per-process.
 *  - `MailService` is replaced with FakeMailService, which records sends
 *    instead of calling Brevo.
 *
 * Everything else — guards, validation, the response envelope, the exception
 * filter — is the genuine article, via the same `configureApp` that `main.ts`
 * uses.
 */
export async function createTestApp(
  options: { throttling?: boolean } = {},
): Promise<TestContext> {
  const prisma = createTestPrismaClient();
  const mail = new FakeMailService();

  // ThrottlerGuard is registered as an APP_GUARD with `useClass`, so Nest
  // instantiates it directly: neither overrideGuard(ThrottlerGuard) nor
  // overrideProvider(APP_GUARD) replaces it. ThrottlerModule's own `skipIf`
  // hook reads this flag on each request instead.
  process.env.DISABLE_RATE_LIMIT = options.throttling ? 'false' : 'true';

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();

  const app = configureApp(moduleRef.createNestApplication());
  await app.init();

  return {
    app,
    prisma,
    mail,
    reset: async () => {
      mail.clear();
      await truncateAll(prisma);
    },
    close: async () => {
      await app.close();
      await prisma.$disconnect();
      delete process.env.DISABLE_RATE_LIMIT;
    },
  };
}

/** Convenience: the Express handler supertest needs. */
export const httpServer = (ctx: TestContext): App =>
  ctx.app.getHttpServer() as App;

/**
 * Pulls the refresh token out of a response's Set-Cookie header.
 *
 * The refresh token stopped being returned in the response body when it moved
 * into an httpOnly cookie — a browser holds it and JavaScript cannot read it,
 * which is the point. Tests are not a browser, so they read the header the
 * browser would have consumed.
 *
 * Returns undefined when no refresh cookie was set, so a test can assert its
 * ABSENCE (on a failed login, say) as easily as its presence.
 */
export function refreshCookieFrom(
  res: request.Response,
): string | undefined {
  const raw = res.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];

  const match = cookies.find((c) => c.startsWith('sbt_refresh='));
  if (!match) {
    return undefined;
  }

  // "sbt_refresh=<value>; Path=/api/auth; HttpOnly; ..." — take the value only.
  const value = match.slice('sbt_refresh='.length).split(';')[0];
  return value.length > 0 ? value : undefined;
}

/** Same, but fails loudly when the cookie a test depends on is missing. */
export function requireRefreshCookie(res: request.Response): string {
  const token = refreshCookieFrom(res);

  if (!token) {
    throw new Error(
      `Expected a ${'sbt_refresh'} cookie on ${res.request.method} ${res.request.url}, got none`,
    );
  }

  return token;
}

export interface RegisterOrganizationOptions {
  organizationName: string;
  email: string;
  password?: string;
  adminName?: string;
  industry?: string;
}

/**
 * Runs the whole two-step org signup — register, read the token out of the
 * captured email, verify — and returns the tokens the second step issues.
 *
 * Every suite needs an organization with a signed-in admin before it can test
 * anything else, so this exists to keep that setup in one place rather than
 * three slightly different copies.
 */
export async function registerOrganization(
  ctx: TestContext,
  options: RegisterOrganizationOptions,
): Promise<{
  accessToken: string;
  refreshToken: string;
  employeeId: string;
}> {
  const {
    organizationName,
    email,
    password = 'Passw0rd!',
    adminName = 'Test Admin',
    industry = 'Technology',
  } = options;

  await request(httpServer(ctx))
    .post('/api/auth/register-organization')
    .send({ email, password })
    .expect(201);

  const token = ctx.mail.tokenFor(email);

  const verified = await request(httpServer(ctx))
    .post('/api/auth/verify-organization')
    .send({ token, organizationName, adminName, industry })
    .expect(200);

  // The admin's employee ID is generated server-side and never returned, so a
  // test that needs it (logging in by employee ID) has to read it back.
  const admin = await ctx.prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!admin) {
    throw new Error(`No admin user was created for ${email}`);
  }

  const { accessToken } = verified.body.data as { accessToken: string };

  // The refresh token is only ever in the Set-Cookie header now — the body
  // carries the access token alone.
  return {
    accessToken,
    refreshToken: requireRefreshCookie(verified),
    employeeId: admin.employeeId,
  };
}
