# Frontend — Auth, Onboarding Scaffold & Marketing Site (Technical Report)

Scope: **`apps/web` only.** No backend, database, or infrastructure work is
covered here — see `docs/phase-notes/phase-2-auth-user-management.md` for
that track.

Status: **Auth (login + org signup) working end-to-end against the real
backend. Onboarding wizard is scaffolded but only step 1 of 6 is built.
Marketing site is fully built as static/interactive UI, not yet
content-final (placeholder pricing, placeholder photography).**

## 1. Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4 (CSS-first config via `@theme` in `globals.css` — no
  `tailwind.config.js`, that file does not exist in v4 and its absence
  is correct, not a missing file)
- React Hook Form + Zod (`@hookform/resolvers`) for all forms
- Zustand for client-side auth state
- Axios for API calls
- lucide-react for icons

## 2. Design system

### Tokens
Defined once in `src/app/globals.css` under `@theme`, consumed everywhere as
`bg-primary`, `text-alert`, `border-neutral`, etc. Tailwind v4 auto-generates
every utility variant (`bg-*`, `text-*`, `border-*`, `ring-*`, ...) from a
single `--color-*` declaration — components never reference raw hex values.

| Token | Light | Dark |
|---|---|---|
| `primary` | `#34548C` | `#5578B8` |
| `alert` | `#E00B05` | (unchanged) |
| `success` | `#10B981` | (unchanged) |
| `warning` | `#F59E0B` | (unchanged) |
| `neutral` | `#6F7175` | `#9CA3AF` |
| `background` | `#F7F8FA` | `#0B1220` |
| `surface` | `#FFFFFF` | `#131B2E` |
| `heading` | `#111827` | `#F3F4F6` |

The `neutral` value (`#6F7175`) was pulled directly from the live Lovable
prototype's computed styles, not invented — it replaced an earlier
placeholder guess.

### Dark mode
- Opt-in via `@custom-variant dark (&:where(.dark, .dark *));` in
  `globals.css` — `dark:` utilities only apply under an explicit `.dark`
  class on `<html>`, not `prefers-color-scheme` alone.
- `ThemeToggle.tsx` toggles the class and persists the choice to
  `localStorage`.
- A blocking inline `<script>` in `layout.tsx` sets the class **before
  first paint** (reads `localStorage`, falls back to
  `prefers-color-scheme` if nothing stored) — without this, dark-mode users
  would see a flash of light mode on every load, since React can't run
  fast enough to prevent that first paint.

### Typography
Inter (`next/font/google`), replacing the unedited Next.js starter default
(Geist). Mapped as the default sans font via `--font-sans` in `@theme`, not
just applied ad hoc per component.

## 3. Folder structure (as actually used, not aspirational)

```
src/
  app/
    auth/
      login/page.tsx
      register/page.tsx
    onboarding/page.tsx
    components/              <- NOT a top-level src/components — this is
      providers.tsx             the one components location in this repo,
      ThemeToggle.tsx            established after an earlier inconsistency
      marketing/                 (a stray src/components/ folder) was found
        Navbar.tsx                and merged into this one.
        Footer.tsx
        Hero.tsx
        FeatureSlider.tsx
        WhoItsFor.tsx
        TrustSignalsSection.tsx
        HowItWorks.tsx
        TrustBanner.tsx
        Testimonials.tsx
        Pricing.tsx
        Faq.tsx
      onboarding/
        StepProgress.tsx
        StepOrgProfile.tsx     <- only step built so far; steps 2-5 pending
    page.tsx                  <- marketing homepage
    layout.tsx
    globals.css
  lib/
    api-client.ts             <- axios instance + extractErrorMessage()
    store/auth-store.ts       <- Zustand: user, tokens, login/register/logout/hydrate
    validation/
      auth.ts                 <- loginSchema, registerSchema
      onboarding.ts           <- one Zod schema per wizard step
```

## 4. Auth — working end-to-end

### The real backend contract (verified by hand against `apps/api`, not assumed)
- `POST /api/auth/register-organization` — creates a new org + its
  `SUPER_ADMIN`. Fields: `organizationName, adminEmployeeId, adminName,
  email, password, confirmPassword`.
- `POST /api/auth/login` — `{ email, password }`. **Email only** — Employee
  ID login is in the PRTS spec but not yet built on the backend.
- `POST /api/auth/register` exists but is a **stopgap** (per backend's own
  engineering notes) for adding a user to an *already-existing* org — not
  used by Sign Up, reserved for the future Invite Acceptance flow.
- `GET /api/auth/me` (Bearer-authenticated) returns
  `{ id, email, role, organizationId }` — **no `name` field yet.**
- All three "create a session" endpoints return `{ accessToken,
  refreshToken }` directly — **no `{success, message, data}` envelope**,
  despite that being mandated by PRTS §A8. Backend has flagged this as a
  known, not-yet-fixed gap (to be solved via a global response
  interceptor). Frontend types are written against the *current real*
  shape, with comments marking exactly what to change once that
  interceptor ships.

### What login/register pages actually do
1. Validate with Zod (`react-hook-form` + `zodResolver`).
2. POST to the endpoint above → get `{ accessToken, refreshToken }`.
3. Immediately call `GET /auth/me` with that token to fetch the actual user
   (since the login/register response itself has no user object).
4. On register, `name` is filled in from the form's own `adminName` field
   (since `/auth/me` doesn't return it); on login, `name` is left
   `undefined` — there's currently no way to get it. `AuthUser.name` is
   typed optional for exactly this reason.
5. Store everything via `useAuthStore().login()` / `.register()` —
   persists `accessToken`, `refreshToken`, and `user` to `localStorage`,
   updates in-memory Zustand state.
6. Both currently redirect to `/onboarding` (temporary — no role-specific
   dashboards exist yet to route to instead).

### Error handling
`extractErrorMessage()` in `api-client.ts` normalizes three different
shapes the backend can return for an error: a plain string, a
class-validator array of strings, or NestJS's default doubly-wrapped
`HttpException.getResponse()` object (`{ statusCode, message, error }`
nested inside the outer filter's own `message` field). This was a **real
crash** found during manual testing — React throwing "Objects are not
valid as a React child" on any failed login — not a hypothetical.

### Password rule
Zod's `registerSchema` regex matches the backend's shared
`packages/constants/index.ts` `PASSWORD_REGEX` exactly (uppercase +
lowercase + digit + special character, 8+ chars) — copied by hand, not
re-derived, so it must be kept in sync manually if the backend's copy ever
changes.

### CORS
Backend's `main.ts` now has `app.enableCors({ origin: ['http://localhost:3000'], credentials: true })` — dev-only, explicitly commented as needing the real production frontend origin before deploy.

## 5. Onboarding wizard — scaffolded, mostly unbuilt

`app/onboarding/page.tsx` owns `currentStep` (1-6) and an accumulated
`Partial<OnboardingPayload>` in local state. Each step is meant to be a
"dumb" form component that only calls `onNext(values)` — **no step makes
its own API call**; the wizard fires exactly one `POST
/organizations/setup` at the very end, on step 6. This endpoint does not
exist on the backend yet, so the wizard cannot currently be completed
end-to-end — it's UI-and-plumbing-only past step 1.

**Built:** `StepProgress` (1-6 indicator), `StepOrgProfile` (fully working,
the template every other step should copy).
**Not built:** `StepOffice`, `StepWorkRules`, `StepDepartments`,
`StepInviteTeam` — stubbed as literal `TODO` placeholders in `page.tsx`
with the exact prop contract each one must follow (`defaultValues`,
`onNext`, `onBack`).

## 6. Marketing site — fully built, not content-final

All sections listed below exist as real components under
`app/components/marketing/` and are assembled in `app/page.tsx`.

- **Navbar / Footer** — shared across future marketing pages (About,
  Contact, Pricing don't exist as separate routes yet; nav links to them
  are already wired and will 404 until those pages are built).
- **FeatureSlider** — full-width autoplaying image carousel, 4 core
  features (Biometric Verification, Geo-Fenced Check-In, Trust Score
  Engine, Payroll-Ready Reports), manual prev/next + dot navigation.
  **Images are placeholder photography** (`picsum.photos`, seeded for
  consistency) — must be replaced with real photography before launch.
- **Hero** — headline + CTAs + stat row, demoted to a smaller strip below
  the slider per direct product feedback (the Live Clock-in Evaluation
  widget that used to live here was removed from the hero entirely — the
  same content still exists in the Trust Signals section below).
- **WhoItsFor** — 6 industry cards with icons, replacing plain text pills.
- **TrustSignalsSection** — interactive: the same 8 signals from the old
  hero widget, click any one to see a plain-language explanation, a
  passing example, and a "contribution to score" progress indicator.
- **HowItWorks, TrustBanner, Testimonials** — static content sections.
- **Pricing** — **4 tiers now, not 3**: Starter (₦1,200/employee/month,
  ≤20 employees), Pro (₦1,800, ≤50 — **placeholder price, marked as such
  directly in the UI**), Professional (₦2,800, ≤100 — **also
  placeholder**), Enterprise (custom, 100+, "Contact Sales"). Pro is
  marked "Most Popular."
- **Faq** — accordion, capped at 4 questions per explicit product
  direction (not meant to be an exhaustive knowledge base).

## 7. Known gaps / honest TODO list

- Onboarding steps 2-5 and the `/organizations/setup` endpoint don't exist.
- Pricing figures for Pro/Professional are explicit placeholders.
- FeatureSlider images are stock placeholders, not real photography.
- Login's biometric button ("Sign in with Face ID / Windows Hello") is
  UI-only, not wired to real WebAuthn.
- `/auth/me` not returning `name` means a returning user who just logs in
  (not signs up) has no display name anywhere in the UI yet.
- `api-client.ts` does not yet handle access-token expiry by calling
  `POST /auth/refresh` automatically — a 401 on an expired token currently
  just fails the request rather than silently refreshing and retrying.
- Employee ID login (PRTS FR-001) isn't possible yet — backend's
  `LoginDto` only accepts email.
- Register/Login currently both redirect to `/onboarding` regardless of
  role — needs real per-role routing once role-specific dashboards exist.
- A pre-existing, unrelated TypeScript error in `StepOrgProfile.tsx`
  (Zod `.default()` on `timezone` confusing react-hook-form's resolver
  type inference) does not block `next dev` but should be fixed before a
  production build (`next build` type-checks the whole project, this
  route included).
- No automated tests exist for any frontend code yet.

## 8. So, is this done?

**Against "can a real organization sign up and log in through the actual
UI"** — yes, verified end-to-end against the live backend, including
finding and fixing a real crash (the error-shape bug) and a real
misconfiguration (malformed JWT secrets in `.env`, missing CORS) along the
way.

**Against a complete product** — no. Onboarding is one step of six. The
marketing site is visually complete but not content-final. No dashboards
(Employee/HR/Team Lead/Admin) exist in this codebase yet — only the
Lovable prototype demonstrates those flows.
