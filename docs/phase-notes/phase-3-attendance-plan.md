# Phase 3 — Attendance Core (Web): plan

**Status:** planned 13 Oct 2026, not started. **Owner:** Enoch (lead), Emmanuel,
Stephanie. **Roadmap target:** 2–3 weeks. **Our estimate:** 3–4 weeks (Phase 2 ran
at about twice its first estimate; we plan for that rather than hope).

**Done bar (Roadmap Rev. 2, Phase 3):** *an employee can clock in, clock out, and
see an accurate daily summary.*

Sources: Roadmap Rev. 2 §4; PRTS v2.0 §9 (FR-002–FR-008), §12, §13, §A13.

---

## 1. Scope

### In

| Ref | Requirement |
|---|---|
| FR-002 | Clock in (authenticated user; fraud checks are Phase 4) |
| FR-003 | Clock out — only after a clock-in; creates a new punch, updates the summary |
| FR-004 | Break start / break end |
| FR-005 | Daily summary generated automatically from punches: first in, last out, working hours, break duration, overtime, attendance status, late status |
| FR-006 | Late detection from work rules — **measured from the end of the grace period** (08:00 start + 10 min grace, in at 08:13 → **3** minutes late, not 13) |
| FR-008 | History: daily, weekly, monthly — in, out, breaks, late, status |
| §12 | Punch events are **immutable** |
| §13 | `POST /api/attendance/{clock-in,clock-out,break-start,break-end}`, `GET /api/attendance/{today,history}`, `PUT /api/work-rules` |

### Out — and where it goes

| Item | Phase |
|---|---|
| Biometrics, registered device, attestation (FR-001 device, FR-002 mandatory checks) | 4 |
| Server-side geo-fence and office-network enforcement, Trust Score | 4 |
| HR review queue (FR-007) | 4 |
| Payroll export, daily/weekly/monthly reports (FR-009, `/api/reports/*`) | 5 |
| Overnight shifts (start one day, end the next) | after MVP — see decision 5 |

---

## 2. Where we start (verified 13 Oct 2026 against the code)

| Area | State |
|---|---|
| Schema | No `PunchEvent`, `AttendanceSummary`, `WorkRule`, `Holiday` or `Device`. `Office` has `latitude`, `longitude`, `geofenceRadiusMeters`. **No time zone on `Organization` or `Office`.** |
| API | `attendance/`, `work-rules/`, `devices/`, `trust-engine/`, `notifications/`, `shared/` are **empty folders**, not imported in `AppModule` |
| `ClockInFlow.tsx` (310 lines) | Real GPS read and distance-to-office in the browser; confirm **waits 600 ms and records nothing** (toast says so) |
| `TodayStatusCard.tsx` (371) | Clock-in → break → clock-out loop held in **sessionStorage** only |
| `employee/attendance/page.tsx` | Calls `GET /attendance/me` — does not exist; PRTS name is `/attendance/history` |
| Onboarding step 1 | Collects `timezone` — **discarded** |
| Onboarding step 3 | Collects `startTime`, `endTime`, `gracePeriodMinutes`, `overtimeAfterHours`, `overtimeMultiplier` — **discarded** (`page.tsx:197`: *"workRules → nowhere"*) |
| `WorkRuleFormModal.tsx` | Adds `name` and `days` — implies several named rules |
| Time regulation, Holidays pages | Sample data, `SampleDataBanner` |
| Reusable from Phase 2 | Org scoping, `AuditService.record(…, tx)`, roles/guards, `TokenCleanupService` job pattern, e2e harness, `packages/types` shared shapes |

**Phase 3 is mostly backend, plus wiring screens that already exist.**

---

## 3. Decisions (taken 13 Oct 2026 — Enoch accepted the recommendations)

1. **Time zone per organisation**, IANA name (e.g. `Africa/Lagos`), default
   `Africa/Lagos`, set from onboarding step 1. Per-office override can be added
   later without breaking anything. Every "which day is this?" is answered in
   the organisation's zone; timestamps are stored in UTC.
2. **Named work rules.** Several per organisation, exactly one marked default;
   an office may point at a rule, otherwise the default applies. Fields: name,
   working days, start, end, grace minutes, overtime-after hours, overtime
   multiplier.
3. **Breaks are subtracted (unpaid).** Working hours = clock-out − clock-in −
   breaks. FR-004's "contribute toward working hours calculations" is
   ambiguous; this is our reading, **to be confirmed by management** because it
   changes pay. Keep it in one place (the summary engine) so it is a one-line
   change if they decide otherwise.
4. **Forgotten clock-out: leave the day open and flag it.** Never invent a
   clock-out time — an inferred punch is a fabricated record. The end-of-day
   job marks the summary as incomplete for HR to resolve.
5. **Overnight shifts out of scope for the MVP.** A shift must start and end on
   the same local day. Reject a rule whose end is before its start.
6. **Record location, don't enforce it.** Every punch stores latitude,
   longitude and GPS accuracy (FR-010 needs them in Phase 4). The browser's
   geo-fence hint stays; the server does not reject on location until Phase 4.

---

## 4. Design rules — where attendance systems go wrong

1. **Server time only.** The punch timestamp is `now()` on the server. Nothing
   the browser sends is used as the time.
2. **The state machine lives in the database transaction.**
   `OUT → IN → ON_BREAK → IN → OUT`. Read the user's last punch with a row lock
   and write the new one in the same transaction, so two fast taps cannot both
   clock in. (Phase 2 #9: read-then-write lost updates until it was atomic.)
3. **Punches are append-only.** No update or delete route, ever. Corrections are
   new events with a reason. Enforce in the database, not only by omitting
   routes.
4. **The summary is derived and rebuildable.** It is recomputed from that day's
   punches inside each punch's transaction. A bug in the maths is fixed by
   recomputing; a corrupted punch could not be.
5. **The summary engine is a pure function** —
   `(punches, workRule, timeZone, holiday?) → summary`, no database. Tested as
   a table of cases, including FR-006's example verbatim.
6. **Tenant scoping on every route**, proved by e2e: company A's punches are
   invisible to company B. This flaw appeared twice in Phase 2.
7. **Audit every punch** through `AuditService.record(…, tx)` in the same
   transaction.

---

## 5. Milestones

| # | Milestone | Owner | Est. |
|---|---|---|---|
| **M0** | Baseline: re-run e2e on a healthy connection; separate staging database from development (Phase 2 gate); confirm decision 3 with management | Enoch | 1–2 d |
| **M1** | Schema, one migration: `Organization.timezone`, `WorkRule`, `Holiday`, `PunchEvent`, `AttendanceSummary`, append-only protection. Hand-written SQL + `migrate deploy` (never `migrate dev` — see `commands.md`) | Enoch | 1 d |
| **M2** | Work rules + holidays API; wire onboarding steps 1 and 3, time-regulation and holidays pages; remove their sample banners | Emmanuel (API), Stephanie (UI) | 3 d |
| **M3** | Punch API: four actions + `GET /attendance/today`; state machine, lock, server time, audit. **Deploy to staging here, not at the end.** | Enoch | 3 d |
| **M4** | Summary engine (pure) + recompute-on-punch; table-driven tests | Enoch + Emmanuel | 2–3 d |
| **M5** | Wire `ClockInFlow`, `TodayStatusCard` to the API, delete the sessionStorage loop; `GET /attendance/history` + history page | Stephanie | 3 d |
| **M6** | End-of-day job: absences (respecting working days and holidays), open days flagged | Emmanuel | 1–2 d |
| **M7** | Exit: staging deploy, roadmap demo live, **sign-off recorded in writing** | All | 1–2 d |

Total ~15–19 working days.

---

## 6. Definition of done for each milestone (PRTS §A13)

- Functional requirement implemented and checked against the PRTS text.
- Unit tests, and **e2e for every new route**.
- Typecheck clean (`tsc --noEmit`) — tests passing is not the same as building.
- Every new guard proved by deliberately breaking it, then reverting.
- Swagger updated.
- Reviewed by a second person (security-sensitive work especially).
- Deployed to staging.

---

## 7. Carried in from Phase 2

- The two §A13 gates (staging database, recorded sign-off) — part of M0/M7.
- One company domain for web + API, so sign-in survives a reload — before M7's
  demo.
- Lint: 36 problems, 21 errors — not blocking; don't add to it.
- `#27` remainder — `ClockInFlow` and `onboarding/page` get tests as M5 and M2
  touch them.
