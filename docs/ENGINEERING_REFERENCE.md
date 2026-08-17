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

**Actual state, as of this Phase 1 close:**

| Module | Controller | Service | Module | Repository | Entity | DTO | Guard | Spec | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `auth/` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ (subfolder) | ✅ (subfolder) | ✅ | Talks to Prisma directly from the service; no repository layer |
| `departments/` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ (subfolder) | ❌ | ⚠️ | Test file is named `departments.service.specs.ts` (extra "s") — **Jest's `testRegex` (`.*\.spec\.ts$`) never matches this file, so it has never actually run in CI.** Needs renaming to `.spec.ts`. |
| `offices/` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | Naming convention violation: files are PascalCase (`OfficeController.ts`, `OfficeService.ts`, etc.) instead of the mandated kebab-case (`office.controller.ts`). Structurally the most complete module (has repository + entity), but doesn't match the file-naming standard every other module follows. |

None of the three modules are fully conformant yet. `offices/` has the right
internal structure but wrong naming; `auth/` and `departments/` have the
right naming but are missing the repository/entity layer; `departments/`
additionally has a silently-dead test file.

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

### 3.1 Auth Module — Phase 2 — Owner: Enoch
**Status:** In progress.

- Endpoints (actual): `POST /auth/register` (stopgap — see §5), `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`, `GET /auth/admin-only`
- Endpoints required by PRTS but **not yet built**: `POST /api/auth/logout`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- Mechanism: JWT access + refresh (rotation on use), Argon2 password hashing, Passport JWT strategy with DB re-validation of user status on every request
- DTOs: `RegisterDto`, `LoginDto`
- RBAC: `JwtAuthGuard` + `RolesGuard` + `@Roles()` decorator, demonstrated on two routes; not yet applied to any real business route

### 3.2 Departments Module — Phase 2 — Owner: Emmanuel
**Status:** In progress. CRUD-shaped, scoped to `organizationId`. Test coverage exists but is not running in CI (see §2.2).

### 3.3 Offices Module — Phase 2 — Owner: Emmanuel
**Status:** In progress. Most structurally complete module so far (has repository + entity layers) but violates the file-naming convention.

### 3.4 Attendance / Trust Score / Reporting Modules
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
  per-org scoping was deferred). `Department.name` is unique **per
  organization** (`@@unique([organizationId, name])`).
- **`User.status`** includes a `PENDING` state (for admin-provisioned users
  who haven't set their own password) alongside `ACTIVE`/`SUSPENDED`.
  `passwordHash` is nullable to support this.
- **PostGIS** is declared as a datasource extension but has no spatial
  queries written against it yet — `Office.latitude`/`longitude` are plain
  `Float` columns for now; geo-fence distance calculations are Phase 4 scope.

**Migrations applied so far:** `init_core_models`, `add_refresh_tokens`,
`add_organizations`, `add_email_to_organization`. See `commands.md` for the
team's migration playbook (including the required procedure for adding a
required column to a populated table).

## 5. Known Gaps Against the PRTS

Carried over from the Phase 2 technical report
([`docs/phase-notes/phase-2-auth-user-management.md`](phase-notes/phase-2-auth-user-management.md)),
listed here since they affect the reference architecture, not just one
phase's report:

- No global `{ success, message, data }` / `{ success, message, error }`
  response envelope (PRTS §A8) — endpoints currently return raw payloads.
- `POST /auth/register` (public self-service) has no basis in the PRTS,
  which specifies admin-driven user creation (`POST /api/users`) instead.
  It exists only as a stopgap to unblock JWT/RBAC testing and needs to be
  retired once the org-creation / provision-user / complete-registration
  flow is built.
- No Swagger/OpenAPI documentation set up, despite being both an
  approved-stack requirement and a Definition of Done line item.
- No global `/api` route prefix, unlike every endpoint path in the PRTS.
- Definition of Done (PRTS §A13) requires integration tests and a staging
  deployment before a feature counts as complete — only unit tests exist so
  far for any module.

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

### Phase 3 — Attendance Core
Not started.

### Phase 4 — Trust Score Engine
Not started.

### Phase 5 — Reporting & Dashboards
Not started.

### Phase 6 — Polish & Demo Prep
Not started.
