# SmartBioTrack — Command Map
<!-- Commands to Run -->

<!-- Run Backend only -->
pnpm install --filter api...

<!-- ===================== -->
<!-- Run API rest -->
pnpm --filter api test

<!-- Start testing on Jest on Watch Mode itself -->
pnpm --filter api test:watch

<!-- Example -->
pnpm --filter api test <service.spec>

An Example: pnpm --filter api test -- auth.service.spec.ts

<!-- JWT random: Generate quick random secret values with: -->
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

<!-- Start the API from root -->
pnpm --filter api dev

<!-- ============================================= -->
<!-- Prisma migrations -->
<!-- ============================================= -->

<!-- Check what state the DB is in vs. the migrations folder -->
npx prisma migrate status

<!-- ── Normal case: you changed schema.prisma and want to keep existing data ── -->
<!-- Must be run from an interactive terminal (it prompts you) — will NOT work -->
<!-- from an AI agent / CI / non-interactive shell. -->
npx prisma migrate dev --name <short_description_of_change>

<!-- Example -->
npx prisma migrate dev --name add_organizations

<!-- ── Destructive case: wipe all data and replay every migration from scratch ── -->
<!-- Only ever run this against a DEV database. It deletes everything. -->
<!-- Prisma will refuse to run this from an AI agent without you typing the -->
<!-- exact confirmation text yourself first. -->
npx prisma migrate reset

<!-- ── Non-destructive case: schema change needs a NOT NULL / new required field ── -->
<!-- on a table that already has rows (e.g. adding organizationId to User) -->
<!-- Don't run `migrate dev` directly — it'll refuse or fail on the constraint. -->
<!-- Instead: -->
<!-- 1. Generate the migration file WITHOUT applying it: -->
npx prisma migrate dev --name <short_description_of_change> --create-only

<!-- 2. Open the generated file at prisma/migrations/<timestamp>_<name>/migration.sql -->
<!--    and hand-edit it to backfill existing rows before the NOT NULL constraint  -->
<!--    is added, e.g.: -->
<!--      ALTER TABLE "User" ADD COLUMN "organizationId" TEXT; -->
<!--      INSERT INTO "Organization" (id, name) VALUES ('<placeholder-uuid>', 'Unassigned'); -->
<!--      UPDATE "User" SET "organizationId" = '<placeholder-uuid>' WHERE "organizationId" IS NULL; -->
<!--      ALTER TABLE "User" ALTER COLUMN "organizationId" SET NOT NULL; -->
<!-- 3. Apply the (now hand-edited) migration: -->
npx prisma migrate dev

<!-- ============================================================= -->
<!-- HOW TO: add a new column to a model that already has rows -->
<!-- (e.g. adding `email` to Organization, `phone` to User, etc.) -->
<!-- ============================================================= -->

<!-- STEP 0 — Decide: is the new field optional, or required? -->
<!-- Optional (String?, Int?, or has a @default(...)) -->
<!--   -> no special handling needed. Just edit schema.prisma and run: -->
<!--        npx prisma migrate dev --name add_phone_to_user -->
<!--   -> Postgres can add a nullable/defaulted column to existing rows with no conflict. -->
<!-- Required (no default, e.g. `email String @unique`) -->
<!--   -> existing rows have nothing to put there. Follow STEPS 1-5 below. -->

<!-- STEP 1 — Add the field to schema.prisma as if it's required (the end state you want) -->
<!-- Example: -->
<!--   model Organization { -->
<!--     ... -->
<!--     email String @unique -->
<!--   } -->

<!-- STEP 2 — Generate the migration WITHOUT applying it -->
npx prisma migrate dev --name add_email_to_organization --create-only

<!-- If it warns "There are N rows in this table, it is not possible to execute this -->
<!-- step" -> that confirms you're in the required-column case. Do NOT run -->
<!-- `migrate dev` again yet. -->

<!-- STEP 3 — Open the generated file and hand-edit it -->
<!-- Path: prisma/migrations/<timestamp>_add_email_to_organization/migration.sql -->
<!-- Prisma's raw version tries to do it in one unsafe step: -->
<!--   ALTER TABLE "Organization" ADD COLUMN "email" TEXT NOT NULL; -->
<!-- Rewrite it into three ordered steps -- add nullable, backfill, then lock it down: -->
<!--   ALTER TABLE "Organization" ADD COLUMN "email" TEXT; -->
<!--   UPDATE "Organization" SET "email" = 'placeholder@example.com' WHERE "email" IS NULL; -->
<!--   ALTER TABLE "Organization" ALTER COLUMN "email" SET NOT NULL; -->
<!--   CREATE UNIQUE INDEX "Organization_email_key" ON "Organization"("email"); -->

<!-- STEP 4 — Apply the (now-correct) migration -->
<!-- No --name here — you already created the migration file, you're just applying it. -->
npx prisma migrate dev

<!-- STEP 5 — Verify -->
npx prisma migrate status
<!-- Should say "Database schema is up to date." -->

<!-- THE ONE RULE: never run `migrate dev` again right after `--create-only` without -->
<!-- opening the SQL file first. That's the whole point of --create-only — it gives -->
<!-- you a pause to check before anything touches the database. -->

<!-- ── If you already messed this up (migration applied raw and failed) ── -->
<!-- Postgres runs each migration in a transaction, so a failed migration usually -->
<!-- rolls back cleanly -- but Prisma still marks it "failed" and blocks new -->
<!-- migrations until you tell it what happened. Fix the .sql file per STEP 3 above, -->
<!-- then: -->
npx prisma migrate resolve --rolled-back <the_failed_migration_name>
npx prisma migrate dev

<!-- ── Applying already-committed migrations (CI / production / this AI agent) ── -->
<!-- Never generates new migrations, never prompts, never touches data beyond -->
<!-- what the migration files say — safe to run non-interactively. -->
npx prisma migrate deploy

<!-- ── You pulled a branch/PR that added new migration files (most common case) ── -->
<!-- The migration files are already committed to the repo — you're not creating -->
<!-- anything new, just catching your own local DB up to what's already there. -->
pnpm install
npx prisma migrate dev

<!-- ============================================================= -->
<!-- "Can't reach database server" (P1001) — Neon cold starts -->
<!-- ============================================================= -->

<!-- If you see this: -->
<!--   Error: P1001: Can't reach database server at -->
<!--   ep-....neon.tech:5432 -->

<!-- FIRST: just run the command again. Seriously. -->
npx prisma migrate status

<!-- WHY: our Neon database is on the free tier, which suspends the compute -->
<!-- after ~5 minutes of inactivity to save your monthly compute-hour budget. -->
<!-- The next connection wakes it, but waking takes a few seconds and the -->
<!-- client can give up first. So attempt 1 fails, attempt 2 succeeds — the -->
<!-- first attempt is what woke it up. This is normal, not a broken database. -->

<!-- THE PROPER FIX: give the connection longer to wait. Add connect_timeout -->
<!-- to DATABASE_URL in your .env: -->
<!--   DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require&channel_binding=require&connect_timeout=30" -->
<!-- This costs nothing when the DB is already awake — it is a ceiling on how -->
<!-- long to wait, not an added delay. -->

<!-- STILL FLAKY ON MIGRATIONS? Use the DIRECT (unpooled) connection string -->
<!-- for migrations. Our DATABASE_URL uses the pooled endpoint (note the -->
<!-- "-pooler" in the hostname). Neon and Prisma both recommend the direct -->
<!-- endpoint for migrations. Your Neon dashboard shows both; the direct one -->
<!-- is the same host without "-pooler". -->

<!-- DO NOT "fix" this by pinging the database on a timer to keep it awake. -->
<!-- Keeping the compute running 24/7 is ~730 hours a month, which will blow -->
<!-- through the free tier allowance and get the database suspended for real -->
<!-- (a hard stop until the quota resets), instead of a 2-second cold start. -->
<!-- Auto-suspend is protecting our quota, not causing the problem. -->

<!-- If retrying does NOT help, check in this order: -->
<!-- 1. console.neon.tech — is the project active, or over quota? -->
<!-- 2. Test-NetConnection <host> -Port 5432   (PowerShell) -->
<!--    TcpTestSucceeded : False means your network is blocking port 5432 -->
<!--    (some office networks, hotspots, and VPNs do). -->

<!-- ============================================= -->
<!-- Postman -->
<!-- ============================================= -->

<!-- Configure the access Token automatically in Postman -->
<!-- Paste into the request's Scripts tab -> "After response". -->
<!-- Use pm.environment.set if your variables live in an Environment; -->
<!-- use pm.collectionVariables.set if they live on the Collection. -->
const res = pm.response.json();
pm.environment.set("accessToken", res.accessToken);
pm.environment.set("refreshToken", res.refreshToken);

<!-- ============================================= -->
<!-- Integration tests -->
<!-- ============================================= -->

<!-- Unit tests (pnpm --filter api test) mock the database entirely. -->
<!-- Integration tests run the REAL app against a REAL Postgres, so they are -->
<!-- the only thing that verifies unique constraints, cascade deletes, -->
<!-- transaction rollback, and tenant isolation actually work. -->

<!-- ONE-TIME SETUP -->
<!-- 1. In console.neon.tech, on the SmartBioTrack project, create a THIRD -->
<!--    branch named "test" (alongside production and development). -->
<!-- 2. Copy its connection string into .env as TEST_DATABASE_URL, and add -->
<!--    connect_timeout=30 like the others: -->
<!--      TEST_DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require&channel_binding=require&connect_timeout=30" -->
<!-- 3. Apply the schema to that branch: -->
DATABASE_URL="<paste TEST_DATABASE_URL value here>" npx prisma migrate deploy

<!-- RUN THEM -->
pnpm --filter api test:e2e

<!-- WHY A SEPARATE BRANCH IS NOT OPTIONAL -->
<!-- These tests TRUNCATE every table between tests. The helper refuses to -->
<!-- start if TEST_DATABASE_URL is unset, if it equals DATABASE_URL, or if it -->
<!-- looks like a production URL — but do not rely on those guards alone. -->
<!-- Point it at a branch you are happy to lose. -->

<!-- NOTES -->
<!-- - They run serially (maxWorkers: 1). Parallel runs would truncate each -->
<!--   other's data mid-test. -->
<!-- - Rate limiting is disabled in all suites except rate-limiting.e2e-spec, -->
<!--   otherwise every suite would start failing on its 6th request. -->
<!-- - Slower than unit tests (real network to Neon). Expect ~30-60s. -->

<!-- ============================================= -->
<!-- Before you push — run ALL THREE -->
<!-- ============================================= -->

<!-- Passing tests do NOT mean a green build. We have twice had all tests -->
<!-- pass while the code would not compile. These three catch different -->
<!-- things; run all of them. -->
pnpm --filter api check-types
pnpm --filter api test
pnpm --filter api lint

<!-- Integration tests are NOT in that list — they need a database and are -->
<!-- slower. Run them before opening a PR, and any time you touch the schema, -->
<!-- a guard, or anything tenant-scoped: -->
pnpm --filter api test:e2e

<!-- Or as a single chain that stops at the first failure: -->
pnpm --filter api check-types && pnpm --filter api test && pnpm --filter api lint
