import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestPrismaClient, truncateAll } from './database';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaClient;
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
 *
 * Everything else — guards, validation, the response envelope, the exception
 * filter — is the genuine article, via the same `configureApp` that `main.ts`
 * uses.
 */
export async function createTestApp(
  options: { throttling?: boolean } = {},
): Promise<TestContext> {
  const prisma = createTestPrismaClient();

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
    .compile();

  const app = configureApp(moduleRef.createNestApplication());
  await app.init();

  return {
    app,
    prisma,
    reset: () => truncateAll(prisma),
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
