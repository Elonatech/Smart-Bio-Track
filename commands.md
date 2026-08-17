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

<!-- Configure the access Token automatically in Postman -->
const res = pm.response.json();
pm.environment.set("accessToken", res.accessToken);
pm.environment.set("refreshToken", res.refreshToken);

<!-- Check for ESLint -->
pnpm --filter api exec tsc --noEmit -p tsconfig.json
