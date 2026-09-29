import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Integration tests TRUNCATE every table between tests. Pointing them at the
 * wrong database destroys real data, so the target must be stated explicitly
 * and is checked three ways before anything connects.
 */
function resolveTestDatabaseUrl(): string {
  const testUrl = process.env.TEST_DATABASE_URL;

  if (!testUrl) {
    throw new Error(
      'TEST_DATABASE_URL is not set.\n\n' +
        'Integration tests wipe every table between tests, so they refuse to\n' +
        'guess at a database. Create a dedicated Neon branch for testing and\n' +
        'put its connection string in .env as TEST_DATABASE_URL.\n' +
        'See commands.md → "Integration tests".',
    );
  }

  // Guard 1: never the same database the app develops against.
  if (testUrl === process.env.DATABASE_URL) {
    throw new Error(
      'TEST_DATABASE_URL is identical to DATABASE_URL.\n\n' +
        'Refusing to run — this would truncate your development data.\n' +
        'Point TEST_DATABASE_URL at a separate Neon branch.',
    );
  }

  // Guard 2: a branch named for production is never a test target, whatever
  // the variable is called.
  if (/prod/i.test(testUrl)) {
    throw new Error(
      'TEST_DATABASE_URL looks like a production database (matched /prod/i).\n' +
        'Refusing to run.',
    );
  }

  return testUrl;
}

export const TEST_DATABASE_URL = resolveTestDatabaseUrl();

export function createTestPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: TEST_DATABASE_URL });
  return new PrismaClient({ adapter });
}

/**
 * Empties every application table, leaving the schema and Prisma's own
 * migration history intact.
 *
 * Discovers tables from the catalogue rather than hardcoding a list, so a new
 * model added to the schema is cleaned automatically and cannot leak state
 * into the next test. CASCADE handles foreign keys regardless of order.
 */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE '_prisma%'
      AND tablename NOT LIKE 'spatial_ref_sys'
  `;

  if (tables.length === 0) return;

  const quoted = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
  );
}
