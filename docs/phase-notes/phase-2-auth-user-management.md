# Phase 2 — Auth & User Management (Technical Report)

Branch: `feat/org-auth-flow` (pushed, not yet merged to `main`)
Status: **Core mechanics complete and tested against a narrower scope than the PRTS defines. Not done against the full spec — see Section 6.**

> Correction: earlier drafts of this note mislabeled this work as "Phase 1."
> Per the Project Roadmap, Phase 1 is **Foundation** (scaffolding, DB design,
> team workflow, CI) — separate work, likely already closed out before this
> log started. Everything below is **Phase 2 — Auth & User Management**.

## 1. What we set out to build

An organization-scoped authentication system: a company registers as the root
tenant (`SUPER_ADMIN`), and that admin can create other roles (`HR_ADMIN`,
`TEAM_LEAD`, `EMPLOYEE`) scoped to their own organization, with JWT-based
session management and role-based access control (RBAC) on top.

## 2. What we achieved

### Data model
- Added an `Organization` model as the tenant root; scoped `User`,
  `Department`, and `Office` to it via `organizationId`.
- `Department` name uniqueness changed from global to per-organization
  (`@@unique([organizationId, name])`) — two companies can both have a "Sales"
  department now.
- Added `RefreshToken` model backing token rotation.
- Added `UserStatus.PENDING` and made `passwordHash` nullable, laying the
  groundwork for admin-provisioned users who haven't set their own password yet.

### Auth mechanics (`apps/api/src/auth/`)
- `AuthService.register/login/refresh` — argon2 password hashing, JWT
  access/refresh token issuance, email normalization (case-insensitive),
  refresh-token rotation (old token revoked when a new pair is issued),
  suspended-account rejection, FK validation on `departmentId`/`officeId`.
- `JwtStrategy` — validates the bearer token, then **re-checks the DB** on
  every request that the user still exists and is `ACTIVE` (not just trusting
  the token payload).
- `JwtAuthGuard` + `RolesGuard` + `@Roles()` decorator — composable route
  protection (`@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('SUPER_ADMIN')`).
- `env.validation.ts` extended to fail fast at boot if `JWT_ACCESS_SECRET`/
  `JWT_REFRESH_SECRET` are missing, instead of failing silently on first login.

### Testing
- 13 Jest unit tests covering register (password mismatch, duplicate
  email/employeeId, invalid department, happy path), login (unknown user,
  wrong password, suspended account, happy path), and refresh (unknown/
  revoked/expired token, successful rotation). All passing.
- Manually verified end-to-end against a real dev database: register → login
  → refresh → rotation-replay-rejection → RBAC allow/deny (401 no token, 403
  wrong role, 200 correct role).

### Tooling / process
- Fixed `pnpm-workspace.yaml` (a literal placeholder string was breaking
  `pnpm install`), wired `packages/constants` as a proper `@smartbiotrack/constants`
  workspace package.
- `apps/api/jest.setup.js` — Jest now loads `.env` the same way `nest start`
  does, so `pnpm --filter api test` works standalone.
- Documented the full Prisma migration playbook in `commands.md`, including
  the specific "add a required column to a populated table" procedure and how
  to recover from a failed migration.

## 3. Challenges and how we resolved them

| Challenge | Resolution |
|---|---|
| Draft `register.dto.ts` had syntax errors (missing colons, missing decorator imports) and a broken relative import path | Manual review + fix; found and fixed as part of code review before running anything |
| `pnpm-workspace.yaml` had a literal placeholder (`argon2: set this to true or false`) that would break every `pnpm install` | Caught in review, set to `true` |
| No multi-tenancy in the original schema — everyone shared one flat namespace | Added `Organization` model; required deciding uniqueness scope (kept `email`/`employeeId` globally unique for now, per your call, to defer domain-based scoping) |
| Adding a **required** `organizationId` column to a `User` table that already had test rows | First attempt would have failed outright; resolved via `migrate reset` (wiping throwaway dev data) rather than a backfill, since it was all test data |
| Adding a **required** `email` column to `Organization` (which by then had a real row) failed with a Postgres NOT NULL violation | Root cause: `--create-only` was used correctly, but the raw generated SQL was applied without hand-editing in a backfill step. Recovered with `prisma migrate resolve --rolled-back` + a hand-edited migration (add nullable → backfill → set NOT NULL) |
| `@nestjs/jwt`'s `sign()` typing rejected a plain `string` for `expiresIn` | Cast to `JwtSignOptions['expiresIn']` |
| Jest didn't have `JWT_ACCESS_SECRET` available (unlike `nest start`, which uses `dotenvx` to auto-inject `.env`) | Added `jest.setup.js` + `setupFiles` config to load `.env` before tests run |
| `prisma migrate dev` / `migrate reset` refuse to run from a non-interactive shell (this AI agent) | Handed exact commands back to you to run in your own terminal; `migrate reset` additionally required you to give explicit typed consent, which Prisma's own safety gate enforces |
| `git push` returned 403 (`Elonatech-Projects` denied) | Stale cached GitHub credential in Windows Credential Manager; cleared it (`git credential-manager-core erase`) and re-authenticated interactively |
| Push then failed with "directory file conflict" | An existing remote branch literally named `testing` collided with the new `testing/org-auth-flow` (git refs are path-like — `testing` can't be both a leaf and a directory). Renamed to `feat/org-auth-flow` |

## 4. Recommendations if similar challenges recur

1. **Any schema change adding a required field to a populated table**: always
   run `--create-only` first, read the warning about existing row counts, and
   hand-edit the SQL into add-nullable → backfill → set-NOT-NULL, before ever
   running `migrate dev` again. This is now written up step-by-step in
   `commands.md` — point new teammates there before they touch `schema.prisma`.
2. **Branch naming**: avoid single bare words (like `testing`) as standalone
   branch names anywhere in the repo, since they permanently block any
   `testing/*`-style nested branch on the same remote. Stick to the
   `<type>/<description>` convention (`feat/`, `fix/`, `docs/`, etc.) already
   in the README, with no bare-word branches at all.
3. **Any new required environment variable** (secrets, API keys) should be
   added to `env.validation.ts` in the same PR that introduces it — don't let
   a service silently depend on `process.env.X` without a boot-time check.
4. **Migrations and dangerous DB operations should never be run by an AI
   agent unsupervised** — this session repeatedly had to hand control back to
   you for `migrate dev`/`migrate reset`, which is correct behavior, not a
   limitation to work around.
5. **Credential/auth issues (git push 403, etc.)** are almost always either a
   stale cached credential or a genuine permissions gap — check which before
   assuming the other; re-authenticating doesn't fix a real permissions gap,
   and requesting access doesn't fix a stale cache.

## 5. What's NOT done yet (be explicit about this before calling Phase 1 "complete")

- `POST /auth/register` is a **stopgap**: it requires an already-existing
  `organizationId`, which currently only exists because we created one by
  hand via a one-off script. There is no `register-organization` (create org
  + its SUPER_ADMIN together), `provision-user` (admin creates a `PENDING`
  employee), or `complete-registration` (employee sets their own password)
  endpoint yet — this was the agreed real design and hasn't been built.
- No RBAC is applied to any real business route yet — only the two
  demonstration routes (`/auth/me`, `/auth/admin-only`) exist.
- No logout / manual session-revocation endpoint.
- No rate limiting or account lockout on login (brute-force exposure).
- `prisma/seed.ts` still targets the old schema (`Department.upsert` without
  `organizationId`) and will fail if run as-is.
- No e2e/integration tests against the actual HTTP layer (Jest coverage is
  service-level only, via `apps/api/test/*.e2e-spec.ts` scaffolding that
  hasn't been extended for auth).
- `.env` secrets are local/plaintext, consistent with early-stage dev but not
  reviewed for production secret management.

## 6. Deviations from the PRTS (v2.0) found on review

Now that the actual Product Requirements & Technical Specification has been
reviewed against what was built, several concrete gaps and one real mistake
surfaced:

- **API response envelope violation.** PRTS §A8 mandates every endpoint
  return `{ success, message, data }` on success and
  `{ success, message, error: { code, details } }` on failure — no
  exceptions. Our endpoints currently return raw `{ accessToken,
  refreshToken }`. Worth noting: an earlier pass in this project actually had
  `AuthResponse`/`ProfileResponse` interfaces shaped exactly like this
  envelope, and they were removed as "dead code" during cleanup — in
  hindsight that removal was a mistake once matched against the spec. This
  needs to be added back, consistently, via a global response interceptor
  rather than per-endpoint, so it can't be forgotten again.
- **Missing endpoints.** PRTS §13 and the Engineering Reference module spec
  both list `POST /api/auth/logout`, `POST /api/auth/forgot-password`, and
  `POST /api/auth/reset-password` as required Auth module endpoints. None
  exist yet.
- **`POST /auth/register` (public self-service) isn't actually in the spec
  at all.** The PRTS's user-management model is admin-driven: `POST
  /api/users` (an authenticated, role-gated action) creates employees — there
  is no public self-registration endpoint anywhere in the spec. This
  validates the org/provision-user/complete-registration redesign already
  discussed as the *correct* direction, and confirms the current
  `/auth/register` stopgap needs to be retired, not extended.
- **Login should accept Employee ID or Email** (FR-001), not email only —
  `LoginDto` currently only accepts email.
- **Missing `/api` global prefix** — the spec's endpoints are all
  `/api/auth/...`; ours are mounted at `/auth/...` directly.
- **No Swagger/OpenAPI docs** — required by the approved stack (§4) and by
  the Definition of Done (§A13: "API documentation has been updated"); not
  set up in `main.ts` at all.
- **Module folder structure doesn't match the mandated shape.** §A2 requires
  every module to include `.repository.ts` and `.entity.ts` files alongside
  controller/service/module/dto/guard/spec. The auth module talks to Prisma
  directly from the service with no repository layer, and has no entity
  file.
- **Env var naming drift**: spec baseline (§A9) uses `JWT_SECRET`; this
  implementation introduced `JWT_ACCESS_SECRET`. Not wrong, but a naming
  choice that diverges from the documented convention without anyone
  deciding to change it.
- **Branch naming conventions actually conflict between two docs.** The
  PRTS/Engineering Reference (§A5) sanctions `feature/`, `bugfix/`,
  `hotfix/`, `release/vX.X` — not `feat/`. The README (reviewed earlier in
  this project) instead says `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`,
  `test/`. I pushed the recent branch as `feat/org-auth-flow`, matching the
  README but technically not the PRTS's own naming convention. Worth
  resolving which document is authoritative — right now the team has two
  different documented answers to "what do I name my branch."
- **Definition of Done (§A13)** requires integration tests, updated API
  docs, UI approval, and a successful staging deployment before a feature
  counts as complete. None of those exist for this work yet — only unit
  tests do.

## 7. So, is Phase 2 done?

**Against the roadmap's one-line bar** ("a real user can register, log in,
and reach a protected part of the system") — yes, demonstrated end-to-end.

**Against the PRTS's actual Auth module spec and the Definition of Done** —
no. The response envelope, missing endpoints (logout/forgot-password/reset-
password), the `/api` prefix, Swagger docs, the repository-layer convention,
and the org-scoped registration redesign are all still open. I would not
present this as "done" to management without closing at least the response
envelope and missing-endpoints gaps, since those are explicit, unambiguous
spec requirements, not judgment calls.
