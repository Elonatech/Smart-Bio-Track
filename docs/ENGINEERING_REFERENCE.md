# SmartBioTrack — Engineering Reference

**Status:** Living document — grows with each phase. Update the relevant section as code lands; don't wait for a "docs pass" at the end.
**Owner:** Enoch Enebeli (Team Lead)
**Team:** Enoch (Backend Lead), Emmanuel (Backend), Stephanie (Frontend)

This is the internal counterpart to the management-facing Project Roadmap and
Phase closeout reports (`docs/phase-notes/`). Where those documents explain
*why* and *when* in plain language, this one explains *how* — the actual
architecture, conventions, and module contracts the team builds against.

## Table of Contents
1. [Architecture & Stack](#1-architecture--stack)
2. [Repository Structure & Conventions](#2-repository-structure--conventions)
3. [Module Specifications](#3-module-specifications)
4. [Database Schema](#4-database-schema)
5. [Known Gaps Against the PRTS](#5-known-gaps-against-the-prts)
6. [Phase Notes](#6-phase-notes)

## 1. Architecture & Stack

### 1.1 High-Level Architecture

```
┌─────────────────────────────┐
│   Next.js Web Portal        │  (Phase 2+, not yet started)
└──────────────┬───────────────┘
               │
    ┌──────────▼───────────┐
    │ React Native Mobile   │  (Deferred — post-MVP)
    └──────────┬────────────┘
               │
          HTTPS / REST API
               │
┌──────────────▼───────────────┐
│         NestJS Backend        │
│ ────────────────────────────  │
│  Authentication (in progress) │
│  Departments (in progress)    │
│  Offices (in progress)        │
│  Attendance Engine (Phase 3)  │
│  Trust Score Engine (Phase 4) │
│  Reporting Engine (Phase 5)   │
└──────────────┬────────────────┘
               │
           Prisma ORM
               │
┌──────────────▼────────────────┐
│    PostgreSQL + PostGIS        │  (PostGIS extension declared,
└─────────────────────────────────┘   not yet queried in code)
```

### 1.2 Actual Stack in Use

| Layer | Technology | Notes |
|---|---|---|
| Backend | NestJS, TypeScript, Prisma ORM (`@prisma/adapter-pg`) | Modular architecture, DI throughout |
| Database | PostgreSQL (Neon) + PostGIS extension | PostGIS declared in `schema.prisma`; no spatial queries written yet — geo-fencing is Phase 4 scope |
| Auth | `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `argon2` | JWT access + refresh, refresh-token rotation, Argon2 hashing |
| Validation | `class-validator`, `class-transformer`, `zod` (env only) | `ValidationPipe` global (`whitelist`, `transform`, `forbidNonWhitelisted`) |
| Monorepo | Turborepo + pnpm workspaces | `apps/api`, `apps/web` (Next.js starter, unchanged), `packages/*` |
| CI | GitHub Actions (`.github/workflows/ci.yml`) | Runs `pnpm turbo run lint` + `pnpm turbo run test` on PRs to `main`/`develop` |
| Infra (current) | Neon (Postgres), free tier | Production and development DB branches provisioned under Elonatech's official GitHub account |

Web frontend and mobile app are both still pre-work — `apps/web` is the
unmodified `create-next-app` starter. Nothing in this document should be read
as implying frontend work has started.

## 2. Repository Structure & Conventions

### 2.1 Actual Repo Layout

```
smartbiotrack/
├── apps/
│   ├── web/            Next.js — starter only, untouched
│   └── api/             NestJS backend
├── packages/
│   ├── constants/       @smartbiotrack/constants (PASSWORD_REGEX etc.)
│   ├── types/, utils/, validation/, ui/, config/, eslint-config/, typescript-config/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── docs/
│   ├── ENGINEERING_REFERENCE.md   (this file)
│   └── phase-notes/               (per-phase closeout reports)
└── commands.md           Team command reference (migrations, testing, env setup)
```

### 2.2 Backend Module Structure — Mandated vs. Actual

The mandated shape (per PRTS Appendix A2) is, per module:
```
<module>/
├── <module>.controller.ts
├── <module>.service.ts
├── <module>.module.ts
├── <module>.repository.ts
├── <module>.dto.ts
├── <module>.entity.ts
├── <module>.guard.ts
└── <module>.spec.ts
```

**Actual state (verified by file scan, August 13 2026):**

| Module | Controller | Service | Module | Repository | Entity | DTO | Guard | Spec | Registered in `AppModule` |
|---|---|---|---|---|---|---|---|---|---|
| `auth/` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ (subfolder) | ✅ (subfolder) | ✅ | ✅ |
| `departments/` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ (subfolder) | ❌ | ✅ | ✅ |
| `offices/` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ (subfolder) | ❌ | ✅ | ✅ |
| `users/` | ⬜ 0 bytes | ⬜ 0 bytes | ⬜ 0 bytes | ❌ | ❌ | ⬜ 0 bytes | ❌ | ❌ | ❌ |

No module has the mandated `.repository.ts` / `.entity.ts` layers — every
service talks to Prisma directly. `users/` exists only as empty stub files.

**Recurring defect to watch for — the `.specs.ts` trap.** Twice now a test
file has been created as `<name>.service.specs.ts` (extra "s"). Jest's
`testRegex` is `.*\.spec\.ts$`, which does **not** match `.specs.ts`, so the
file never runs — while `tsc` still typechecks it, meaning it can break the
build without any test ever failing. This happened in `departments/` (fixed
Aug 13) and again in `offices/` (fixed Aug 13). **Always name test files
`.spec.ts`.** Confirm a new spec actually runs by checking the suite count
in `pnpm --filter api test` goes up.

**Corrigendum:** an earlier revision of this document described `offices/` as
"structurally the most complete module (has repository + entity)". That was
wrong — it was inferred from filenames that existed but were empty (0 bytes).
The PascalCase files it referred to (`OfficeController.ts` etc.) have since
been replaced by kebab-case equivalents.

### 2.3 Git Branch Naming — Unresolved Conflict

Two documents in this project currently specify **different** branch-naming
conventions:

- **README.md** (this repo): `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`
- **PRTS Appendix A5 / Engineering Reference**: `feature/`, `bugfix/`, `hotfix/`, `release/vX.X`

The branch pushed for the Phase 2 auth work (`feat/org-auth-flow`) followed
the README's convention. **This needs to be resolved and one convention
picked** — right now two developers following two different documents would
both be "correct" and produce inconsistent branch names.

## 3. Module Specifications

All routes below sit behind the global `/api` prefix
(`app.setGlobalPrefix('api')` in `main.ts`). Controllers must **not** repeat
`api/` in their own `@Controller()` path — doing so produces `/api/api/...`.

### 3.1 Auth Module — Phase 2 — Owner: Enoch
**Status:** In progress.

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /api/auth/register-organization` | public | Creates `Organization` + its `SUPER_ADMIN` in one `$transaction` |
| `POST /api/auth/register` | public | **Stopgap** — no basis in the PRTS, to be retired (see §5) |
| `POST /api/auth/login` | public | Email + password |
| `POST /api/auth/refresh` | public | Rotates: revokes the presented token, issues a new pair |
| `GET /api/auth/me` | any authenticated role | Returns the caller's own profile |
| `GET /api/auth/admin-only` | `SUPER_ADMIN`, `HR_ADMIN` | RBAC demonstration route |

- Required by PRTS but **not built**: `logout`, `forgot-password`, `reset-password`
- Mechanism: JWT access + refresh with rotation, Argon2 hashing, Passport JWT
  strategy that re-checks the DB on every request that the user still exists
  and is `ACTIVE`
- RBAC primitives: `JwtAuthGuard`, `RolesGuard`, `@Roles()`

### 3.2 Departments Module — Phase 2 — Owner: Emmanuel
**Status:** Working. Full CRUD at `/api/departments`, every operation scoped to
`req.user.organizationId` (taken from the JWT, never the request body).
Cross-tenant access returns `404` rather than `403` so record existence
doesn't leak. `create`/`update` restricted to `HR_ADMIN`/`SUPER_ADMIN`;
`delete` to `SUPER_ADMIN`. Name unique per organization.

### 3.3 Offices Module — Phase 2 — Owner: Emmanuel
**Status:** Working. Full CRUD at `/api/offices`, same tenant-scoping and role
rules as departments. `@@unique([organizationId, name])` added Aug 13, which
makes the `P2002` handler in `create()` reachable (it was dead code before the
constraint existed). Geo-fence fields (`latitude`, `longitude`,
`geofenceRadiusMeters`) are stored but not yet queried — Phase 4 scope.

### 3.4 Users Module — Phase 2 — not started
Empty stub files only. This is where the provisioning flow belongs
(`POST /api/users`) — see §5.

### 3.5 Attendance / Trust Score / Reporting Modules
**Status:** Not started — Phase 3+ per roadmap.

## 4. Database Schema

Schema lives at [`prisma/schema.prisma`](../prisma/schema.prisma) — this
section links to it rather than duplicating it, per this doc's own stated
policy of avoiding two sources of truth.

**Current models:** `Organization`, `Department`, `Office`, `User`,
`RefreshToken`.

Key structural decisions made during Phase 1/early Phase 2:

- **Multi-tenancy**: `Organization` is the tenant root; `User`, `Department`,
  `Office` are all scoped to it via `organizationId`.
- **Uniqueness scope**: `User.email` and `User.employeeId` are globally
  unique across all organizations (a deliberate simplification — domain-based
  per-org scoping was deferred). `Department.name` and `Office.name` are each
  unique **per organization** (`@@unique([organizationId, name])`).
  `Organization.name` and `Organization.email` are globally unique.
- **`User.status`** includes a `PENDING` state (for admin-provisioned users
  who haven't set their own password) alongside `ACTIVE`/`SUSPENDED`.
  `passwordHash` is nullable to support this.
- **PostGIS** is declared as a datasource extension but has no spatial
  queries written against it yet — `Office.latitude`/`longitude` are plain
  `Float` columns for now; geo-fence distance calculations are Phase 4 scope.

**Migrations applied so far (5):** `init_core_models`, `add_refresh_tokens`,
`add_organizations`, `add_email_to_organization`,
`add_unique_office_name_per_organization`. See `commands.md` for the team's
migration playbook (including the required procedure for adding a required
column or constraint to a populated table).

## 5. Known Gaps Against the PRTS

Listed here rather than only in a phase report, since they affect the
reference architecture. Cross-reference:
[`docs/phase-notes/phase-2-auth-user-management.md`](phase-notes/phase-2-auth-user-management.md).

**Closed since the last revision:** the global `/api` prefix is now in place
(`app.setGlobalPrefix('api')`).

Still open:

- **Response envelope.** No global `{ success, message, data }` /
  `{ success, message, error }` wrapper (PRTS §A8) — endpoints return raw
  payloads. Should be a single global interceptor, not per-controller.
- **Missing auth endpoints.** `logout`, `forgot-password`, `reset-password`
  are all named in PRTS §13 and none exist.
- **`POST /auth/register` shouldn't exist.** The PRTS specifies admin-driven
  user creation (`POST /api/users`); there is no public self-registration
  endpoint in the spec. Ours is a stopgap to unblock JWT/RBAC testing and
  must be retired once the provisioning flow lands.
- **Login by Employee ID.** FR-001 says "Employee ID **or** Email Address";
  `LoginDto` accepts email only.
- **No Swagger/OpenAPI**, despite being both an approved-stack requirement
  and a Definition of Done line item.
- **No repository/entity layers** in any module (PRTS §A2 mandates both).
- **No integration or e2e tests.** Every existing test mocks `PrismaService`,
  so nothing verifies real SQL behaviour — unique constraints, cascade
  deletes, and the compound indexes are all unexercised. PRTS §A13 requires
  integration tests and a staging deployment before a feature counts as done.
- **Rate limiting** on `/auth/login` (PRTS §10 security list) — not present,
  so nothing throttles brute-force attempts.
- **Refresh tokens stored in plaintext.** `RefreshToken.token` holds the raw
  JWT; if that table leaked, every stored token would be directly usable.
  Passwords are hashed; these are not.

### 5.1 Provisioning flow — designed, not built

The agreed model (matching PRTS §7's admin-driven user management):

```
register-organization  →  Organization + SUPER_ADMIN (password set, ACTIVE)
POST /api/users        →  SUPER_ADMIN or HR_ADMIN provisions a PENDING user
                          (no password) + issues a one-time activation token
                          role ceiling: SUPER_ADMIN may create any role;
                          HR_ADMIN may create only TEAM_LEAD / EMPLOYEE
complete-registration  →  invited user sets their own password,
                          status flips PENDING → ACTIVE, tokens issued
POST /api/auth/login   →  identical for every role thereafter
```

One login endpoint serves all roles — authentication doesn't vary by role;
authorization does, downstream, via `RolesGuard`. Splitting login per role
would duplicate credential logic and invite privilege-escalation bugs.

Requires a new `ActivationToken` model (hashed at rest, like refresh tokens
should be). Email delivery is deferred — no SMTP is configured yet — so the
activation token will be returned in the `POST /api/users` response as a
**documented temporary stand-in** until notifications exist.

## 6. Phase Notes

Each phase gets one dated entry once its gate review happens — the honest
record of what actually took longer than expected, used to calibrate the
next phase's estimate.

### Phase 1 — Foundation
**Closed: August 7, 2026.** Target was 1–2 weeks; actual was ~3 focused days
of setup led solo by Enoch (repo creation, collaborator/branch setup via
Stephanie, Neon database provisioning with production/development branches,
monorepo structure, Prisma schema and client, shared packages, env
configuration, CI pipeline). No formal phase-gate demo was held — the team
lead directly oversaw the process with Stephanie and Emmanuel reporting back
their pieces. Full closeout report: `docs/phase-notes/` (management-facing
version delivered separately as a `.docx`).

### Phase 2 — Auth & User Management
**Status: In progress**, started informally before Phase 1's closeout was
formally communicated. See
[`docs/phase-notes/phase-2-auth-user-management.md`](phase-notes/phase-2-auth-user-management.md)
for the detailed technical report, including PRTS deviations found on
review.

**Build health as of August 13, 2026:** typecheck clean, lint clean,
4 test suites / 30 tests passing, 5 migrations applied.

**Recurring lessons from this phase — worth reading before writing code:**

1. **Green tests do not mean a green build.** Twice, `pnpm test` reported all
   suites passing while `tsc --noEmit` failed — once because a stale spec was
   named `.specs.ts` (typechecked but never executed), once because
   `@IsNotEmpty({}, {...})` was called with two arguments in three DTO files.
   Run `tsc --noEmit` *and* `test` *and* `lint` before pushing; they catch
   different things.
2. **CI does not run on `testing`.** `.github/workflows/ci.yml` triggers only
   on `main` and `develop`, so a broken build can sit on the shared `testing`
   branch unnoticed. This has already happened once.
3. **Fixes get lost in merges.** The org-scoping guard on
   `DepartmentsService.create()` was reverted by a merge and survived only as
   an uncommitted local edit. After any merge, re-run the checks and re-read
   the security-relevant lines.
4. **The same defect class recurs across modules.** Departments and Offices
   independently shipped: an unregistered module, an unscoped `findAll` (a
   cross-tenant data leak), and IDOR on `findOne`/`update`/`delete`. When a
   new CRUD module lands, check those three things first.

### Phase 3 — Attendance Core
Not started.

### Phase 4 — Trust Score Engine
Not started.

### Phase 5 — Reporting & Dashboards
Not started.

### Phase 6 — Polish & Demo Prep
Not started.
