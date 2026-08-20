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
    ┌──────────▼────────────┐
    │ React Native Mobile   │  (Deferred — post-MVP)
    └──────────┬────────────┘
               │
          HTTPS / REST API
               │
┌──────────────▼────────────────┐
│         NestJS Backend        │
│ ────────────────────────────  │
│  Authentication      (done)   │
│  Users / Provisioning (done)  │
│  Departments         (done)   │
│  Offices             (done)   │
│  Attendance Engine (Phase 3)  │
│  Trust Score Engine (Phase 4) │
│  Reporting Engine (Phase 5)   │
└──────────────┬────────────────┘
               │
           Prisma ORM
               │
┌──────────────▼─────────────────┐
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
| API docs | `@nestjs/swagger` + CLI plugin | `/api/docs`; schemas generated from class-validator decorators — see §2.4 |
| CI | GitHub Actions (`.github/workflows/ci.yml`) | `lint` + `check-types` + `test`, on `main`, `develop` **and** `testing` |
| Infra (current) | Neon (Postgres), free tier | Production and development DB branches provisioned under Elonatech's official GitHub account |

**Frontend status.** `apps/web` in this repo is still the unmodified
`create-next-app` starter. Frontend work has begun on Stephanie's machine
(marketing pages designed; login, signup step 1, and the homepage coded
against the live API) but **is not yet in version control**. Until it is
pushed, nothing here describes it and no one else can run it.

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

**Actual state (verified by file scan, August 19 2026):**

| Module | Controller | Service | Module | Repository | Entity | DTO | Guard | Spec | Registered in `AppModule` |
|---|---|---|---|---|---|---|---|---|---|
| `auth/` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ (subfolder) | ✅ (subfolder) | ✅ | ✅ |
| `departments/` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ (subfolder) | ❌ | ✅ | ✅ |
| `offices/` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ (subfolder) | ❌ | ✅ | ✅ |
| `users/` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ (subfolder) | ❌ | ✅ | ✅ |

No module has the mandated `.repository.ts` / `.entity.ts` layers — every
service talks to Prisma directly. See §5.

Shared code lives in `src/common/`: `token.util.ts`, the response-envelope
interceptor, the exception filter, and the `@ResponseMessage` decorator.

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

## 2.4 API Conventions

### Response envelope (PRTS §A8)

**Every** response uses one of two shapes. Applied globally in `main.ts`, so no
controller has to opt in.

```jsonc
// success — TransformInterceptor
{ "success": true, "message": "Signed in successfully.", "data": { } }

// failure — AllExceptionsFilter
{ "success": false, "message": "Invalid credentials",
  "error": { "code": "UNAUTHORIZED", "details": [] } }
```

Guarantees the frontend can rely on:

- `message` is **always a plain string**, never an object or array
- `error.details` is **always an array** — class-validator failures are
  flattened into it, with the first message promoted to `message`
- `error.code` is a stable string (`BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`,
  `NOT_FOUND`, `CONFLICT`, `TOO_MANY_REQUESTS`, `INTERNAL_SERVER_ERROR`) —
  branch on this, not on the message text
- unexpected (non-`HttpException`) errors return a generic
  `"Internal server error"` — stack traces and connection strings are logged
  server-side only (PRTS §A11)

Before this landed, the filter passed `HttpException.getResponse()` through
untouched, which produced three different error shapes depending on the failure
and forced the frontend to normalize them. Do not reintroduce that.

**Setting the success message**, in order of precedence:

1. `@ResponseMessage('Signed in successfully.')` on the handler
2. a `message` string on the object the service returned — it is *lifted out*
   of `data`, so `{ message: 'Signed out' }` becomes
   `{ success, message: 'Signed out', data: null }` rather than nesting
3. the default, `"Request successful."`

Do **not** hand-add `success` or `message` to a service return value expecting
it to pass through — the interceptor already owns the envelope, and doing both
produces a doubly-wrapped body.

### Swagger / OpenAPI

- UI: `http://localhost:4000/api/docs` · raw spec: `/api/docs-json`
- Schemas are generated by the **`@nestjs/swagger` CLI plugin**, configured in
  `apps/api/nest-cli.json`. With `classValidatorShim: true` it reads the
  `class-validator` decorators already on our DTOs and emits the matching
  `@ApiProperty()` metadata, so `@IsEmail()` becomes `format: email`,
  `@IsEnum(UserRole)` becomes an enum dropdown, `@IsOptional()` drops the field
  from `required`, and so on. **We do not hand-write `@ApiProperty()`.**
- `introspectComments: true` turns a JSDoc comment above a DTO property into
  its description in the UI — worth writing them.
- The plugin runs at **build** time, not runtime: restart the dev server after
  changing a DTO or the docs will show the old schema.

## 3. Module Specifications

All routes below sit behind the global `/api` prefix
(`app.setGlobalPrefix('api')` in `main.ts`). Controllers must **not** repeat
`api/` in their own `@Controller()` path — doing so produces `/api/api/...`.

### 3.1 Auth Module — Phase 2 — Owner: Enoch
**Status:** Complete for Phase 2.

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /api/auth/register-organization` | public | Creates `Organization` + its `SUPER_ADMIN` in one `$transaction` |
| `POST /api/auth/complete-registration` | public | Invitee redeems an activation token and sets their own password |
| `POST /api/auth/login` | public | **Employee ID or email** in a single `identifier` field (FR-001) |
| `POST /api/auth/refresh` | public | Rotates: revokes the presented token, issues a new pair |
| `POST /api/auth/logout` | any authenticated role | Revokes one refresh token, or all with `{"all": true}` |
| `POST /api/auth/forgot-password` | public | Issues a 30-minute reset token |
| `POST /api/auth/reset-password` | public | Redeems it; revokes every session for that user |
| `GET /api/auth/me` | any authenticated role | Returns the caller's own profile |
| `GET /api/auth/admin-only` | `SUPER_ADMIN`, `HR_ADMIN` | RBAC demonstration route |

`POST /api/auth/register` was **deleted** (Aug 17). It had no basis in the PRTS
and let any caller self-register into any organization at any role by passing
an `organizationId` in the body. Its replacement is the provisioning flow
(§5.1), which takes `organizationId` from the caller's JWT instead.

- Mechanism: JWT access + refresh with rotation, Argon2 password hashing,
  Passport JWT strategy that re-checks on every request that the user still
  exists and is `ACTIVE`
- RBAC primitives: `JwtAuthGuard`, `RolesGuard`, `@Roles()`

**Login identifier resolution.** `LoginDto` takes one `identifier` field, and
the presence of `@` decides whether it is looked up as an email or an employee
ID. A separate `email`/`employeeId` pair was rejected deliberately — it would
let a caller claim one and send the other.

### 3.1.1 Opaque tokens — one shared design

Activation tokens, password-reset tokens, and refresh tokens all follow the
same pattern, implemented once in `src/common/token.util.ts`:

- 32 random bytes, hex-encoded, handed to the user exactly once
- only the **SHA-256 digest** is stored, so a leak of the table yields nothing
  directly usable
- single-use (`usedAt` / `revoked`) and time-limited

**Why SHA-256 and not argon2 here.** Argon2 salts randomly, so the same input
produces a different digest each time — you could never look the record up by
hash. These tokens are 32 random bytes, so there is nothing to brute-force and
a fast deterministic digest is the right tool. Passwords, which are
low-entropy and guessable, still use argon2.

| Token | TTL | On use |
|---|---|---|
| Activation | 7 days | Marked used; user flips `PENDING` → `ACTIVE` |
| Password reset | 30 minutes | Marked used; **all** refresh tokens revoked |
| Refresh | 7 days | Revoked and replaced (rotation) |

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

### 3.4 Users Module — Phase 2 — Owner: Enoch
**Status:** Working. This is the PRTS's admin-driven user management (§7).

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /api/users` | `SUPER_ADMIN`, `HR_ADMIN` | Provisions a `PENDING` user and returns a one-time activation token |
| `GET /api/users` | `SUPER_ADMIN`, `HR_ADMIN`, `TEAM_LEAD` | Org-scoped list |

**Role ceiling.** `@Roles()` only answers "may this caller reach the
endpoint" — not "may they assign *that* role". The second question is a lookup
table in `UsersService`:

| Caller | May create |
|---|---|
| `SUPER_ADMIN` | `SUPER_ADMIN`, `HR_ADMIN`, `TEAM_LEAD`, `EMPLOYEE` |
| `HR_ADMIN` | `TEAM_LEAD`, `EMPLOYEE` only |
| `TEAM_LEAD`, `EMPLOYEE` | nobody |

A `SUPER_ADMIN` may create another `SUPER_ADMIN` — a deliberate decision, so an
organization is not left without full control if its founding admin leaves.
`HR_ADMIN` is capped below its own level so it cannot escalate itself or
create a peer.

`CreateUserDto` has **no** password and **no** `organizationId`. The password
is set by the invitee at activation; the organization comes from the caller's
JWT. `departmentId` and `officeId` are validated with
`findFirst({ id, organizationId })` so an admin cannot attach a new user to
another tenant's department.

### 3.5 Attendance / Trust Score / Reporting Modules
**Status:** Not started — Phase 3+ per roadmap.

## 4. Database Schema

Schema lives at [`prisma/schema.prisma`](../prisma/schema.prisma) — this
section links to it rather than duplicating it, per this doc's own stated
policy of avoiding two sources of truth.

**Current models:** `Organization`, `Department`, `Office`, `User`,
`RefreshToken`, `ActivationToken`, `PasswordResetToken`.

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

**Migrations applied so far (7):** `init_core_models`, `add_refresh_tokens`,
`add_organizations`, `add_email_to_organization`,
`add_unique_office_name_per_organization`, `add_activation_tokens`,
`hash_refresh_tokens_add_password_reset`. See `commands.md` for the team's
migration playbook — including the required procedure for adding a required
column or constraint to a populated table, and what to do about Neon's P1001
cold-start errors.

The last migration is worth reading as an example: renaming
`RefreshToken.token` to `tokenHash` could not preserve the 18 existing rows
(plaintext values cannot be turned into hashes), so it opens with an explicit
`DELETE FROM "RefreshToken";`. Everyone signed in again once.

## 5. Known Gaps Against the PRTS

Listed here rather than only in a phase report, since they affect the
reference architecture. Cross-reference:
[`docs/phase-notes/phase-2-auth-user-management.md`](phase-notes/phase-2-auth-user-management.md).

**Closed since the last revision (Aug 17–19):** global `/api` prefix; the
`{ success, message, data }` response envelope (§2.4); `logout`,
`forgot-password`, `reset-password`; login by Employee ID or email (FR-001);
Swagger/OpenAPI (§2.4); refresh tokens hashed at rest; the non-spec
`POST /auth/register` deleted; the provisioning flow built (§3.4); CORS; and
typecheck added to CI.

Still open:

- **No repository/entity layers** in any module (PRTS §A2 mandates both).
  Every service talks to Prisma directly. This is real debt but it is a
  refactor across four working modules with no behavioural payoff — better
  done once, deliberately, than negotiated per-module while the module set is
  still growing.
- **No integration or e2e tests.** Every existing test mocks `PrismaService`,
  so nothing verifies real SQL behaviour — unique constraints, cascade
  deletes, and the compound indexes are all unexercised. PRTS §A13 requires
  integration tests *and* a staging deployment before a feature counts as
  done, so this blocks a formal "done" claim.
- **Rate limiting** on `/auth/login` (PRTS §10 security list) — nothing
  throttles brute-force attempts. `@nestjs/throttler` is the standard fix.
- **No email delivery.** Two endpoints currently return a token directly in
  the response as a documented stand-in: `POST /api/users` returns
  `activationToken`, and `POST /api/auth/forgot-password` returns
  `resetToken`. **Both MUST be removed once SMTP exists** — until then,
  anyone who can call `forgot-password` for a known address can read the
  reset token. Acceptable for local development only.
- **`/auth/me` does not return `name`.** The JWT strategy returns
  `{ id, email, role, organizationId }`, so a user who logs in (rather than
  signing up) has no display name available to the UI. Raised by the frontend.
- **No staging deployment.** Everything runs locally.

### 5.1 Provisioning flow — BUILT (Aug 14), retained for reference

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
**Closed: August 7, 2026.** Target was 1–2 weeks; actual was ~4 focused days
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
