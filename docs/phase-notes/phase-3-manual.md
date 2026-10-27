# SmartBioTrack — Phase 3 Manual: Attendance Core (Web)

| | |
|---|---|
| **Status** | Active phase guide. Phase 2 closed out 13 Oct 2026; Phase 3 began the same day. **M0, M1, M2 (backend) and M3 are done**; this manual is the working reference for the rest. |
| **Team** | Enoch (attendance logic, punch API, review) · Emmanuel (work rules, holidays, end-of-day job) · Stephanie (clock-in screen, history, setup wizard wiring) |
| **Target duration** | Roadmap: 2–3 weeks. Our estimate: **3–4 weeks** (Phase 2 ran at about twice its first estimate). |
| **Exit condition** | *An employee can clock in, clock out, and see an accurate daily summary* — demonstrated live, with the sign-off **recorded in writing** before Phase 4 begins. |
| **Last updated** | 27 October 2026 |

**Before you start:** pull `testing` (backend) or `frontend-testing` (frontend),
run `pnpm install`, and confirm your database has migration 18:

```bash
npx prisma migrate status
```

You should see `18 migrations found` and `Database schema is up to date!`. If
not, see §13.2.

**Companion documents:** `docs/phase-notes/phase-3-attendance-plan.md` (the
decision record), PRTS v2.0 §9 (FR-002–FR-010), §12, §13, §A13.

---

## Table of contents

1. [Phase 3 goals and scope](#1-phase-3-goals-and-scope)
2. [Where we are](#2-where-we-are)
3. [Decisions you must know](#3-decisions-you-must-know)
4. [The data model](#4-the-data-model)
5. [The five ideas that make attendance correct](#5-the-five-ideas-that-make-attendance-correct)
6. [API reference](#6-api-reference)
7. [Remaining backend work — Emmanuel](#7-remaining-backend-work--emmanuel)
8. [Frontend work — Stephanie](#8-frontend-work--stephanie)
9. [Testing requirements](#9-testing-requirements)
10. [Integration checklist](#10-integration-checklist)
11. [Exit demo script](#11-exit-demo-script)
12. [Common pitfalls specific to attendance](#12-common-pitfalls-specific-to-attendance)
13. [Workflow: branches, migrations, commits](#13-workflow-branches-migrations-commits)
14. [File map](#14-file-map)

---

## 1. Phase 3 goals and scope

By the end of this phase, the system supports:

- **Clock in** and **clock out** (FR-002, FR-003), with **several sessions a
  day** — clocking out for an errand and back in is normal.
- **Breaks** — start and end (FR-004).
- **A daily summary**, generated automatically from punches (FR-005): first
  clock-in, last clock-out, working minutes, break minutes, overtime,
  attendance status, late status.
- **Late detection** from configured working hours (FR-006).
- **History** — the employee's own days, weeks and months (FR-008).
- **Working-hours rules** and a **holiday calendar**, configured by
  administrators, so lateness and absence mean something.
- **The organisation's timezone**, so "which day" and "08:00" are the
  company's, not the server's.
- **An end-of-day job** that marks absences and flags unfinished days.

**Explicitly out of scope for Phase 3:**

| Not in Phase 3 | Where it goes |
|---|---|
| Biometric verification, registered devices, device attestation | Phase 4 |
| **Enforcing** the geo-fence or office network on the server | Phase 4 — Phase 3 *records* location, it does not refuse on it |
| Trust Score Engine, HR review queue (FR-007) | Phase 4 |
| Payroll export, daily/weekly/monthly HR reports (FR-009, `/api/reports/*`) | Phase 5 |
| Overnight shifts | Deferred — see decision 5 |
| Department-specific working hours | Deferred — see decision 9 |

The roadmap is deliberate about this order: **prove the attendance heart is
correct before layering fraud prevention on top of it.** A trust score
computed over wrong hours is worse than no trust score.

---

## 2. Where we are

| # | Milestone | Owner | State |
|---|---|---|---|
| M0 | Baseline: clean e2e, staging DB, breaks decision | Enoch | ✅ e2e clean. **Open:** staging database, management's answer on breaks |
| M1 | Database schema and protections | Enoch | ✅ Migration 18, on dev and test |
| M2 | Work rules, holidays, organisation settings | Emmanuel / Stephanie | ✅ Backend done. ✅ Screens wired 19 Oct — gaps in §8.4 |
| M3 | Punch API | Enoch | ✅ Done |
| M4 | Summary engine | Enoch + Emmanuel | ✅ Built inside M3 (`day-summary.ts`). ⏳ The overtime definition — §3 |
| M5 | Connect the clock-in screen, today card and history | Stephanie | ✅ Wired 16–19 Oct — see §8.4 for three gaps |
| M6 | End-of-day job | Enoch | ✅ Built 20 Oct — §7.1 |
| M7 | Staging deploy, live demo, written sign-off | All | ⏳ §11 |

Test counts on 15 Oct: **308 API unit, 176 e2e, 491 web**, all passing.

---

## 3. Decisions you must know

Taken by Enoch between 13 and 15 October. **Do not code around them** — if one
looks wrong, raise it; changing one is a decision, not an edit.

| # | Decision | What it means in code |
|---|---|---|
| 1 | **One timezone per organisation** (IANA name, default `Africa/Lagos`) | `Organization.timezone`. Timestamps stored in UTC; only "where midnight falls" uses the zone |
| 2 | **Named work rules**, one the organisation default, optionally assigned per office | `WorkRule.isDefault`, `Office.workRuleId`. Resolution: office's rule → default → none |
| 3 | **Breaks are unpaid** — subtracted from working time | `BREAKS_ARE_PAID = false` in `day-summary.ts`. *Pending management confirmation* — it is the one line to change |
| 4 | **A forgotten clock-out is flagged, never invented** | `AttendanceSummary.isIncomplete`. Nothing ever writes a CLOCK_OUT the person did not make |
| 5 | **No overnight shifts** in the MVP | A rule's end must be after its start. Enforced by the API **and** a database CHECK |
| 6 | **Location recorded, not enforced** | Every punch stores latitude, longitude, accuracy. Nothing refuses on them until Phase 4 |
| 7 | **Several sessions a day** | `CLOCKED_OUT` is not terminal — you can clock in again |
| 8 | **Night shifts stay refused** (confirmed 15 Oct) | The setup wizard must refuse an end before the start, too (§8.1) |
| 9 | **Department rules deferred** | Additive later: a `departmentId` on WorkRule and one more resolution step |

### Decided 27 October 2026

**10. Overtime is flexible, chosen per rule** (`WorkRule.overtimeBasis`):

| Basis | Meaning | 09:00–17:00 rule, in 09:00, out 18:30, 1 h lunch |
|---|---|---|
| `END_TIME` — **the default** | Time worked after the rule's end is overtime ("9 to 5, anything after 5pm") | 1 h 30 |
| `DAILY_HOURS` | Worked time beyond `overtimeAfterMinutes` ("8 hours a day") | 30 min |
| `NONE` | Not tracked | 0 |

`END_TIME` counts only work after the end — a break taken after 17:00 is not
overtime, and arriving early is not overtime. It counts regardless of
lateness. A request that sends `overtimeAfterMinutes` with no basis means
`DAILY_HOURS` (how it worked before); one that sends neither gets `END_TIME`.
Migration `20261027090000_add_overtime_basis`; existing rules keep their
meaning (threshold → `DAILY_HOURS`, none → `NONE`).

**11. Super Admins are exempt from attendance** (`ATTENDANCE_EXEMPT_ROLES` in
`attendance/attendance-rules.ts`). The punch API refuses them (403) and the
end-of-day job never marks them absent. HR Admins and Team Leads are staff and
stay tracked.

---

## 4. The data model

Migration: `prisma/migrations/20261013090000_add_attendance_core/migration.sql`.

### 4.1 The shape in one sentence

**`PunchEvent` is the evidence and never changes; `AttendanceSummary` is
arithmetic over it and can always be rebuilt; `WorkRule` and `Holiday` are the
inputs to that arithmetic.**

```
Organization ─┬─ timezone ("Africa/Lagos")
              ├─ WorkRule[]          (one isDefault)
              ├─ Holiday[]
              ├─ Office ── workRuleId? ──► WorkRule
              └─ User
                   ├─ PunchEvent[]          append-only
                   └─ AttendanceSummary[]   one per user per local day
```

### 4.2 Organization and Office — additions

```prisma
model Organization {
  // ...
  timezone String @default("Africa/Lagos")   // IANA name
}

model Office {
  // ...
  workRuleId String?
  workRule   WorkRule? @relation(fields: [workRuleId], references: [id], onDelete: SetNull)
}
```

`onDelete: SetNull` means deleting a rule drops its offices back to the
organisation default rather than refusing the delete.

### 4.3 WorkRule — when people are expected to work

```prisma
model WorkRule {
  id                   String   @id @default(uuid())
  organizationId       String
  name                 String
  isDefault            Boolean  @default(false)
  workingDays          Int[]                      // ISO: 1 = Mon … 7 = Sun
  startMinutes         Int                        // 08:00 → 480
  endMinutes           Int                        // 17:00 → 1020
  gracePeriodMinutes   Int      @default(0)
  overtimeAfterMinutes Int?                       // null = no overtime tracking
  overtimeMultiplier   Decimal  @default(1.5) @db.Decimal(4, 2)
  // ...
  @@unique([organizationId, name])
}
```

**Why minutes, not "08:00" strings:** so the database can enforce `end >
start` itself, and so nothing parses a string in the middle of payroll
arithmetic. **The API converts at the edge** — clients send and receive
`"08:00"` and never see 480.

**Why `Decimal` for the multiplier, never `Float`:** it ends up multiplied into
money, and floating point cannot represent 1.1 exactly.

### 4.4 Holiday

```prisma
model Holiday {
  id              String      @id @default(uuid())
  organizationId  String
  name            String
  date            DateTime    @db.Date     // a calendar date: no time, no zone
  type            HolidayType @default(PUBLIC)   // PUBLIC | COMPANY
  repeatsAnnually Boolean     @default(false)
  @@unique([organizationId, date, name])
}
```

`repeatsAnnually` matches the same month and day every year (New Year's Day).
Leave it false for holidays that move — Eid, Easter — which are entered each
year.

### 4.5 PunchEvent — the evidence

```prisma
model PunchEvent {
  id             String    @id @default(uuid())
  organizationId String
  userId         String                         // onDelete: Restrict
  type           PunchType                      // CLOCK_IN | CLOCK_OUT | BREAK_START | BREAK_END
  occurredAt     DateTime  @default(now())      // the SERVER's clock
  workDate       DateTime  @db.Date             // local day, in the org's zone, at punch time
  latitude       Float?
  longitude      Float?
  accuracyMeters Float?
  createdAt      DateTime  @default(now())
  @@index([userId, workDate, occurredAt])
  @@index([organizationId, workDate])
}
```

**`workDate` is stored, not derived later.** If an organisation changes its
timezone in March, January's punches must not move to different days.

### 4.6 AttendanceSummary — derived, rebuildable

```prisma
model AttendanceSummary {
  id                    String           @id @default(uuid())
  organizationId        String
  userId                String
  workDate              DateTime         @db.Date
  status                AttendanceStatus  // PRESENT | ABSENT | ON_HOLIDAY | REST_DAY
  firstClockIn          DateTime?
  lastClockOut          DateTime?
  workedMinutes         Int      @default(0)
  breakMinutes          Int      @default(0)
  overtimeMinutes       Int      @default(0)
  isLate                Boolean  @default(false)
  lateMinutes           Int      @default(0)
  isIncomplete          Boolean  @default(false)
  // snapshot of the rule it was judged against:
  workRuleId            String?
  scheduledStartMinutes Int?
  scheduledEndMinutes   Int?
  gracePeriodMinutes    Int?
  computedAt            DateTime @updatedAt
  @@unique([userId, workDate])
}
```

**The rule snapshot matters.** If HR moves the start time from 08:00 to 09:00 in
March, a January summary must still say January was judged against 08:00.

### 4.7 Protections the database enforces itself

Prisma's schema language cannot express these, so they live only in the
migration SQL. **Do not "tidy" them away because they are missing from
`schema.prisma`.**

| Protection | SQL | Why |
|---|---|---|
| **Punches cannot be edited or deleted** | `BEFORE UPDATE OR DELETE` trigger `PunchEvent_append_only` raises | PRTS §12: punches are immutable. A pay dispute is settled by what was recorded at the time. A mistake is answered by a **new** punch |
| One default rule per organisation | Partial unique index `WHERE "isDefault"` | Two defaults would make "which rule?" a coin toss |
| Sensible rules | CHECKs: `end > start`, minutes within the day, grace 0–180, working days 1–7 and non-empty, multiplier 1–5 | A bad rule is refused when saved, not discovered as negative lateness on a payslip |
| Sensible summaries | CHECKs: durations ≥ 0; `isLate = (lateMinutes > 0)` | A negative duration means the arithmetic is wrong — fail loudly in testing |
| Attendance survives a user | `ON DELETE RESTRICT` from PunchEvent and AttendanceSummary to User | Users are soft-deleted; a hard delete must never take attendance with it |

`TRUNCATE` is deliberately **not** blocked — the e2e suite resets tables with
it. Nothing in the application truncates.

---

## 5. The five ideas that make attendance correct

Attendance systems go wrong in a small number of well-known ways. Each idea
below closes one.

### 5.1 The server's clock, in the organisation's timezone

**Plain English.** The time of a punch is always the server's clock — a
device's clock is set by the person being timed. But "which day is this?" and
"is 08:13 late?" are questions about the *company's* calendar. Render runs in
UTC, which is an hour behind Lagos: using the server's own idea of midnight puts
a 00:30 Lagos clock-in on the previous day, and judges an 08:05 arrival against
08:00 UTC.

**The rule:** never use a `Date`'s local methods (`getHours`, `setHours(0)`,
`getDay`). Always go through `apps/api/src/attendance/attendance-time.ts`:

```ts
import { localMoment, toDbDate, isoWeekday } from './attendance-time';

const now = new Date();                                  // server clock, UTC
const { date, minutes } = localMoment(now, 'Africa/Lagos');
// date    = "2026-10-14"   the company's calendar day
// minutes = 493            08:13 — seconds truncated, not rounded

await prisma.punchEvent.create({
  data: { /* ... */ occurredAt: now, workDate: toDbDate(date) },
});
```

`toDbDate("2026-10-14")` returns **UTC midnight of that calendar date**, which
is what a Postgres `DATE` column needs. Local midnight would be 23:00 the
previous day in UTC, and Postgres would store yesterday.

**Seconds are truncated** so FR-006's example comes out as the PRTS states it:
a clock showing 08:13 is minute 493 whether it is 08:13:00 or 08:13:59.

### 5.2 A state machine, checked under a lock

**Plain English.** A person can be in one of four states, and each allows
specific actions. Two taps on the button at once — or two tabs — must never
record two clock-ins.

| State | Allowed next |
|---|---|
| `NOT_STARTED` | clock in |
| `CLOCKED_IN` | clock out, start break |
| `ON_BREAK` | end break |
| `CLOCKED_OUT` | clock in (another session) |

The state comes from **today's punches** — the last punch decides it. The
rules live in `attendance-state.ts` as pure functions:

```ts
stateFromPunches([{ type: 'CLOCK_IN' }, { type: 'BREAK_START' }]); // 'ON_BREAK'
refusalFor('ON_BREAK', 'CLOCK_OUT');  // "You are on a break. End your break before clocking out."
refusalFor('CLOCKED_IN', 'BREAK_START'); // null — allowed
```

**The race, and the fix.** Checking the state and then writing is two steps.
Two requests can both read "not clocked in" and both insert. The fix is to do
both **inside one transaction, holding a row lock on the user**:

```ts
await prisma.$transaction(async (tx) => {
  // A second punch from the same person waits HERE until the first commits,
  // then reads the punch the first one wrote.
  await tx.$queryRaw`
    SELECT id FROM "User"
    WHERE id = ${caller.id} AND "organizationId" = ${caller.organizationId}
    FOR UPDATE`;

  const now = new Date();                       // AFTER the lock — see below
  const punches = await tx.punchEvent.findMany({ /* today, this user */ });
  const refusal = refusalFor(stateFromPunches(punches), type);
  if (refusal) throw new ConflictException(refusal);  // 409

  await tx.punchEvent.create({ /* ... occurredAt: now ... */ });
  // ... summary + audit, same transaction
}, { maxWait: 10_000, timeout: 15_000 });
```

**The clock is read after the lock.** Read before it, a request that waited
behind another could record an *earlier* time than the punch it queued behind,
and the day's punches would be out of order.

This was **proved, not assumed**: with `FOR UPDATE` removed, two simultaneous
clock-ins both succeeded — three runs out of three.

### 5.3 The summary is a pure function

**Plain English.** Every number on a day's summary is worked out from that
day's punches plus the rule, the timezone and whether it is a holiday. Nothing
else. So the arithmetic is a pure function with no database inside it, tested
as a table of cases — and a summary can be recomputed at any time and come out
the same.

```ts
import { computeDaySummary } from './day-summary';

const summary = computeDaySummary({
  workDate: '2026-10-14',
  timeZone: 'Africa/Lagos',
  punches: [
    { type: 'CLOCK_IN',    occurredAt: /* 08:13 Lagos */ },
    { type: 'BREAK_START', occurredAt: /* 12:00 */ },
    { type: 'BREAK_END',   occurredAt: /* 13:00 */ },
    { type: 'CLOCK_OUT',   occurredAt: /* 17:00 */ },
  ],
  rule: { id: 'r1', workingDays: [1,2,3,4,5], startMinutes: 480,
          endMinutes: 1020, gracePeriodMinutes: 10, overtimeAfterMinutes: 480 },
  isHoliday: false,
  dayClosed: false,
});
// → { status: 'PRESENT', isLate: true, lateMinutes: 3,
//     breakMinutes: 60, workedMinutes: 467, overtimeMinutes: 0, ... }
```

**How it walks the punches** — alternating work and break segments, each closed
by the punch that ends it:

```
CLOCK_IN ──work──► BREAK_START ──break──► BREAK_END ──work──► CLOCK_OUT
```

A segment still open when the punches run out contributes **nothing yet**. Its
length is not known until it ends, and guessing it is how a summary goes wrong.

**Lateness (FR-006)** is measured from the **end of the grace period**, on the
**first** clock-in only:

```ts
lateMinutes = Math.max(0, arrivedAtMinute - (rule.startMinutes + rule.gracePeriodMinutes));
// 08:00 start, 10 grace, in at 08:13 → 493 - 490 = 3. Not 13.
```

It is **never** late on a holiday, a rest day, or when no rule exists.
Returning from an errand at 14:00 is not lateness.

**Status, in order:** any clock-in → `PRESENT` (working a holiday is still
present, just never late). Otherwise holiday → `ON_HOLIDAY`; not a working day
→ `REST_DAY`; a working day with a rule → `ABSENT`; no rule at all → **no
summary** — nobody is absent from hours that were never set.

### 5.4 One transaction for punch, summary and audit

Every punch, in one transaction:

1. Lock the user's row.
2. Read the clock.
3. Read today's punches; refuse if the state machine says no.
4. Insert the punch.
5. Recompute the summary from **all** of today's punches; upsert it.
6. Write the audit entry.

If any step fails, **none** of it happened. The original version of this module
saved the punch, then failed updating a summary that did not exist yet — so the
employee saw an error, tapped again, and was told they were already clocked in.

### 5.5 Every query is scoped to the organisation — and to the caller

Every attendance route acts on **the caller only**. There is no `:userId` in
any attendance URL, so there is no identifier to change into someone else's.
Every query also filters by `organizationId`.

**Both filters matter.** The original controller read `req.user.userId`, which
no longer exists (JwtStrategy returns `id`). Prisma treats
`{ userId: undefined }` as **no filter** — so "my punches" would have returned
the whole company's. The organisation filter kept *other companies* out, which
is why our first isolation test still passed with the bug in place. **It
would still have leaked between colleagues** — so there is now a same-company
test that fails with the bug and passes without it.

---

## 6. API reference

Base URL: `http://localhost:8000/api` locally. Every request below needs
`Authorization: Bearer <accessToken>` from `POST /auth/login`.

**Every response is wrapped (PRTS §A8):**

```json
{ "success": true, "message": "Request successful.", "data": { ... } }
```

```json
{ "success": false, "message": "You are already clocked in.",
  "error": { "code": "CONFLICT", "details": [] } }
```

Unknown fields in a request body are **rejected with 400**, not ignored
(`forbidNonWhitelisted`). That matters for attendance: a client cannot slip in
a timestamp.

### 6.1 Attendance — any signed-in user, acting on themselves

| Method | Path | Body | Success |
|---|---|---|---|
| POST | `/attendance/clock-in` | location (optional) | 201 |
| POST | `/attendance/clock-out` | location (optional) | 201 |
| POST | `/attendance/break-start` | location (optional) | 201 |
| POST | `/attendance/break-end` | location (optional) | 201 |
| GET | `/attendance/today` | — | 200 |
| GET | `/attendance/history?from=&to=` | — | 200 |

**Location body** — all optional; latitude and longitude come as a pair or not
at all:

```json
{ "latitude": 6.5244, "longitude": 3.3792, "accuracyMeters": 15 }
```

**Punch response** (`data`):

```json
{
  "state": "CLOCKED_IN",
  "punch":   { "id": "…", "type": "CLOCK_IN", "occurredAt": "2026-10-14T07:13:04.120Z" },
  "summary": {
    "workDate": "2026-10-14", "status": "PRESENT",
    "firstClockIn": "2026-10-14T07:13:04.120Z", "lastClockOut": null,
    "workedMinutes": 0, "breakMinutes": 0, "overtimeMinutes": 0,
    "isLate": true, "lateMinutes": 3, "isIncomplete": false,
    "scheduledStartMinutes": 480, "scheduledEndMinutes": 1020, "gracePeriodMinutes": 10
  }
}
```

**`GET /attendance/today`** (`data`):

```json
{ "workDate": "2026-10-14", "timeZone": "Africa/Lagos",
  "state": "CLOCKED_IN", "punches": [ … ], "summary": { … } | null }
```

**`GET /attendance/history`** — `from` and `to` are local dates
`YYYY-MM-DD`. Defaults: `to` = today, `from` = 29 days earlier. Maximum range
**93 days** (payroll ranges are Phase 5).

```json
{ "from": "2026-09-16", "to": "2026-10-14", "timeZone": "Africa/Lagos",
  "days": [ { "workDate": "2026-10-14", "status": "PRESENT", … } ] }
```

**Errors:**

| Status | When |
|---|---|
| 400 | Bad location (latitude 200, latitude without longitude); unknown field; bad or impossible date (`2026-02-31`); `from` after `to`; range over 93 days |
| 401 | No or expired token |
| 409 | The state machine refuses — the `message` is written for the person, e.g. *"End your break before clocking out."* |

### 6.2 Work rules

Read: **anyone signed in** (an employee may know their own hours). Write:
**SUPER_ADMIN, HR_ADMIN**.

| Method | Path | Notes |
|---|---|---|
| GET | `/work-rules` | Default first, then by name. Each lists the `offices` using it |
| GET | `/work-rules/:id` | |
| POST | `/work-rules` | The **first** rule always becomes the default |
| PATCH | `/work-rules/:id` | Any subset of fields |
| DELETE | `/work-rules/:id` | 204. Offices using it fall back to the default |

```json
{
  "name": "Standard",
  "workingDays": [1, 2, 3, 4, 5],
  "startTime": "08:00",
  "endTime": "17:00",
  "gracePeriodMinutes": 10,
  "overtimeAfterMinutes": 480,
  "overtimeMultiplier": 1.5,
  "isDefault": true
}
```

| Refused | Status |
|---|---|
| End not after start — *"Overnight shifts are not supported yet."* (also when only one time is changed and the resulting pair is overnight) | 400 |
| Malformed time, weekday outside 1–7, empty or repeated days, multiplier < 1 | 400 |
| Setting `isDefault: false` on the default — make another the default instead | 400 |
| Deleting the default while other rules exist | 400 |
| Duplicate name in the organisation | 409 |
| Another organisation's rule | 404 |

**Assigning a rule to an office:** `PUT /offices/:id` with
`{ "workRuleId": "<uuid>" }`, or `null` to return it to the default. Another
organisation's rule is refused with 400 — the office update is spread straight
into the database write, so this check is what stops a foreign id riding
along. *(Proved: with the check disabled, a foreign rule attached with 200.)*

### 6.3 Holidays

Read: anyone signed in. Write: SUPER_ADMIN, HR_ADMIN.

| Method | Path | Notes |
|---|---|---|
| GET | `/holidays?year=2027` | Defaults to this year. Annual holidays appear in every year, with `onDate` set to their date in that year |
| POST | `/holidays` | `{ "name", "date": "2026-10-01", "type": "PUBLIC" \| "COMPANY", "repeatsAnnually" }` |
| PATCH | `/holidays/:id` | |
| DELETE | `/holidays/:id` | 204 |

Refused: impossible date → 400; same name on the same date → 409.

### 6.4 Organisation settings

| Method | Path | Who |
|---|---|---|
| GET | `/organization` | anyone signed in — `{ id, name, industry, timezone }` |
| PATCH | `/organization` | **SUPER_ADMIN only** — `{ name?, industry?, timezone? }` |

The timezone is validated against the zones Node knows; `"Lagos"` is refused
with 400 (`"Africa/Lagos"` is correct). A misspelt zone would otherwise fail on
the first clock-in, for everyone in the company. Changing it moves which day
**future** punches belong to; past punches keep their stored `workDate`.

### 6.5 Audit actions added in Phase 3

`CLOCK_IN`, `CLOCK_OUT`, `BREAK_START`, `BREAK_END` (target: the punch),
`WORK_RULE_CREATED/UPDATED/DELETED`, `HOLIDAY_CREATED/UPDATED/DELETED`,
`ORGANIZATION_UPDATED` (a timezone change records both values:
*"Africa/Lagos → Pacific/Kiritimati"*). All written inside the action's own
transaction, so an action without its audit entry cannot happen.

---

## 7. Remaining backend work — Emmanuel

### 7.1 M6 — the end-of-day job (built 20 Oct 2026)

> **Status: done.** Built as `attendance/day-close.service.ts` with the
> decisions in a pure function, `attendance/day-close-plan.ts`, and the shared
> rule and holiday lookups moved to `attendance/attendance-rules.ts`. Tests:
> `day-close-plan.spec.ts` (14) and `test/day-close.e2e-spec.ts` (9). The
> requirements below are what it was built to; they stay here as the
> description of what it does and must keep doing. **Read the code before
> changing it** — what follows was the brief, and the code is the truth.
>
> How it differs from the sketch: it runs **hourly** and re-checks the last
> **three** days, so a server that was down catches up and a holiday entered
> the next morning turns ABSENT into ON_HOLIDAY. A day with punches only ever
> has its `isIncomplete` flag changed — lateness is never re-judged against a
> rule changed since. Each day's writes and its audit entry
> (`ATTENDANCE_DAY_CLOSED`, actor "System") are one transaction.

**Plain English.** Punches only create summaries for days someone punched. A
day nobody clocked in on has no summary — so nobody is ever "absent", and a
day someone forgot to clock out of is never flagged. The end-of-day job closes
each day after it ends:

1. **Absences:** for every active user whose rule says yesterday was a working
   day, who is not on holiday, and who has **no** summary — write one with
   status `ABSENT` (or `ON_HOLIDAY` / `REST_DAY`, whatever the summary
   function says).
2. **Unfinished days:** for every summary from yesterday whose punches end
   while clocked in or on a break — recompute with `dayClosed: true`, which
   sets `isIncomplete`. **Never write a clock-out** (decision 4).

**Follow `TokenCleanupService`** (`apps/api/src/maintenance/`) for the shape —
it already does the hard parts: started in `onModuleInit`, a `setInterval`
timer, bounded batches, and logging. No scheduling library is needed.

```ts
// apps/api/src/attendance/day-close.service.ts — sketch, not final
@Injectable()
export class DayCloseService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Hourly, not nightly: organisations live in different timezones, so
    // "yesterday has ended" happens at a different UTC hour for each.
    this.timer = setInterval(() => void this.closeEndedDays(), 60 * 60 * 1000);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async closeEndedDays(now = new Date()) {
    const orgs = await this.prisma.organization.findMany({
      select: { id: true, timezone: true },
    });
    for (const org of orgs) {
      const today = localMoment(now, org.timezone).date;
      const yesterday = shiftDays(today, -1);
      await this.closeDay(org.id, org.timezone, yesterday);
    }
  }

  // For each active user in the org: resolve their rule (office → default),
  // read that day's punches, check the holiday calendar, then
  //   computeDaySummary({ ..., dayClosed: true })
  // and upsert the result. A null result (no rule, no punches) writes nothing.
}
```

**Requirements for M6:**

- **Idempotent.** Running it twice for the same day must produce the same
  rows. Use `upsert` on `userId_workDate`. A restart mid-run must be harmless.
- **Never overwrite a day that has punches** except by recomputing from those
  punches with `dayClosed: true`.
- **Reuse `computeDaySummary` and the rule resolution** — do not write a second
  copy of the arithmetic. If you need the resolution logic, extract
  `contextFor`'s rule lookup from `AttendanceService` into a shared helper
  rather than copying it.
- **Only `ACTIVE` users.** Suspended, removed and not-yet-activated people are
  not absent.
- **Only days from the user's start.** Someone invited today was not absent
  yesterday — compare against `User.createdAt` in the organisation's zone.
- **Batch it**, like the token sweeper — an organisation with 5,000 staff must
  not load them all at once.
- **Test it with a fixed `now`**, which is why `closeEndedDays` takes one. A
  test that depends on the real clock passes or fails depending on the hour.
- **Audit:** a system action (actor `null` → "System"), one entry per run per
  organisation, not one per absence.

**Open design question for you:** department-specific working hours were your
idea and were deferred (decision 9), not rejected. When they come, they are
additive — sketch how you would add them so the decision is ready.

### 7.2 What not to change without a conversation

- `day-summary.ts` — the arithmetic is pinned by tests that name the bugs they
  guard against. If a test seems wrong, raise it; the original break-time bug
  looked like a reasonable piece of code.
- The migration's hand-written SQL (§4.7).
- `FOR UPDATE` and the clock-after-lock ordering in `AttendanceService.punch`.

---

## 8. Frontend work — Stephanie

The screens are well ahead of the server and honestly labelled — every one says
it saves nothing. Phase 3's frontend work is mostly **replacing local stand-ins
with real calls**, and deleting the stand-ins.

Everything goes through `appClient` (`apps/web/src/lib/api-client.ts`), which
handles the token and silent refresh. Remember the envelope: the payload is at
`response.data.data`.

### 8.1 M2 — setup wizard, work rules and holidays

**Onboarding step 1** (`StepOrgProfile`) — the timezone and profile now have
somewhere to go. In `onboarding/page.tsx` `handleFinish`, the comment *"orgProfile
→ nowhere"* becomes:

```ts
await appClient.patch('/organization', {
  name: payload.orgProfile.organizationName,
  industry: payload.orgProfile.industry,
  timezone: payload.orgProfile.timezone,   // must be an IANA name, e.g. "Africa/Lagos"
});
```

**The timezone picker currently sends `"WAT"`, which the API refuses.**
`StepOrgProfile.tsx` has a single option, `value="WAT"`, and the step's default
is `timezone: "WAT"`. Abbreviations are not timezones — "WAT" has no rules for
history or daylight saving, and Node cannot resolve it. Change the value (the
label can stay):

```tsx
<option value="Africa/Lagos">(GMT+1) West Africa Time — WAT</option>
```

and the default in the same file to `timezone: "Africa/Lagos"`. Any option
added later must use an IANA name (`"Africa/Accra"`, `"Europe/London"`).

**Onboarding step 3** (`StepWorkRules`) — *"workRules → nowhere"* becomes a
`POST /work-rules`. Two things first:

1. **Refuse an end before the start** (decision 8). Today
   `lib/overtime.ts`'s `hoursBetween` reads 20:00–06:00 as a 10-hour night
   shift; the API will refuse that rule. Validate in the zod schema so the
   person sees it at the step, not as an error on the final screen:

   ```ts
   export const workRulesSchema = z.object({ /* ... */ })
     .refine((v) => v.endTime > v.startTime, {
       message: 'The end time must be after the start time. Overnight shifts are not supported yet.',
       path: ['endTime'],
     });
   ```

   (`"HH:MM"` strings compare correctly as text.)

2. **Wait for the overtime decision** (§3) before sending overtime fields. Until
   then, send the rule without `overtimeAfterMinutes`:

   ```ts
   await appClient.post('/work-rules', {
     name: 'Standard hours',
     workingDays: [1, 2, 3, 4, 5],          // or from the step, if it asks
     startTime: payload.workRules.startTime,
     endTime: payload.workRules.endTime,
     gracePeriodMinutes: payload.workRules.gracePeriodMinutes,
     isDefault: true,
   });
   ```

**Keep `handleFinish` idempotent** — its existing rule. Read
`GET /work-rules` first and only create if none exists, exactly as it already
does for offices and departments, or a retry after a partial failure fails
forever on "already exists" (409).

**Time-regulation page** (`dashboard/super-admin/time-regulation`) — replace
the sample data with `GET /work-rules`; create/edit through
`WorkRuleFormModal` → `POST`/`PATCH /work-rules`; show which branches use each
rule (`offices` in the response); offer "make default". Remove its
`SampleDataBanner` **in the same change** — the banner rule test will fail the
build if it stays on a page that now calls the API, and fail it the other way
if it goes before the page does.

**Holidays page** (`dashboard/super-admin/holidays`) — `GET /holidays?year=`,
with `POST`/`PATCH`/`DELETE`. Show annual holidays on `onDate`, not `date`.
Remove its banner too.

**Branch → rule** — the office (Branch) edit form gets a rule picker sending
`workRuleId` (or `null` for "company default") on `PUT /offices/:id`.

### 8.2 M5 — clock-in, today, history

**The one function to replace** is `submitClockIn` in
`components/dashboard/clockInOutcome.ts` — its own comment says so. The Phase 3
server never returns `flagged` or `rejected` (that is Phase 4's Trust Score),
so a successful punch maps to `approved`:

```ts
export async function submitClockIn(location?: {
  latitude: number; longitude: number; accuracyMeters: number;
}): Promise<ClockInOutcome> {
  try {
    const res = await appClient.post('/attendance/clock-in', location ?? {});
    return { status: 'approved', recordedAt: res.data.data.punch.occurredAt };
  } catch (err) {
    // 409 = the state machine said no; its message is written for the person.
    return { status: 'rejected', reasons: [extractErrorMessage(err)] };
  }
}
```

`recordedAt` is now genuinely the **server's** timestamp, which is what the
file's comments already insist on.

**`ClockInFlow.tsx`** — keep the GPS read and the distance-to-branch display;
send the position with the punch. Remove the *"saves to your screen only"*
text. **The geo-fence check stays a hint, not a block** (decision 6) — it is
fine to warn "you appear to be outside the branch", but do not stop the punch;
the server is the authority in Phase 4.

**`TodayStatusCard.tsx`** — delete the sessionStorage loop entirely. On load:

```ts
const { data } = await appClient.get('/attendance/today');
const today = data.data;  // { state, punches, summary, workDate, timeZone }
```

Drive the buttons from `today.state`:

| `state` | Buttons |
|---|---|
| `NOT_STARTED` | Clock in |
| `CLOCKED_IN` | Start break · Clock out |
| `ON_BREAK` | End break |
| `CLOCKED_OUT` | Clock in again |

After every punch, **replace** local state with the response's `state` and
`summary` — do not compute the next state in the browser. The server is the
source of truth, and a second tab may have punched.

The running timer may tick in the browser for display, but the **numbers that
count** come from `summary.workedMinutes` / `breakMinutes`.

**Show times in the organisation's zone**, not the browser's:

```ts
new Intl.DateTimeFormat('en-GB', {
  timeZone: today.timeZone, hour: '2-digit', minute: '2-digit',
}).format(new Date(punch.occurredAt));
```

A manager travelling with a laptop set to London should still see Lagos times.

**History page** (`dashboard/employee/attendance`) — it currently calls
`GET /attendance/me`, which does not exist. Change it to
`GET /attendance/history?from=YYYY-MM-DD&to=YYYY-MM-DD` and read `data.days`.
Week and month views are just ranges (max 93 days).

**Errors worth handling specifically:**

| Response | Show |
|---|---|
| 409 | The server's `message` as-is — it is written for the person |
| 401 | Nothing; `appClient` refreshes and retries |
| Network failure | "Not recorded — check your connection and try again." **Never** show a punch as recorded unless the server said so |

### 8.4 Gaps found in the wiring (review, 20 Oct)

The 16–19 Oct commits wired clock-in, breaks, history, work rules, holidays and
the per-branch rule picker to the real API; every path they call exists, and
the web suite passes (551). Three things remain:

1. **Overtime was decided in code, not by a decision.** Onboarding converts
   "overtime from 17:00" to `overtimeAfterMinutes = 17×60 − startMinutes`
   (540 for an 08:00 start). With breaks subtracted, someone working 08:00–17:00
   with an hour's lunch has worked 480 minutes — so overtime would start at
   **18:00**, not the 17:00 the screen shows. Pay; needs the §3 decision.
2. **Onboarding does not refuse overnight hours.** `WorkRuleFormModal` does
   (`.refine`), but `lib/validation/onboarding.ts`'s `workRulesSchema` does
   not — 22:00–06:00 passes every step and fails at "Finish setup".
3. **Step 1 is still not saved.** `handleFinish` still says *"orgProfile →
   nowhere"*, and the timezone value is still `"WAT"` (§8.1). Name, industry
   and timezone from step 1 are dropped; every organisation stays on
   `Africa/Lagos`.

### 8.3 Shared types

When the response shapes settle, move them into `packages/types` the way #26
did for users (`MeResponse`, `UserListItem`), and bind the API to them with
`satisfies`. Until then, do not hand-copy enum lists into the frontend —
`PunchType` and `AttendanceStatus` should come from one place.

---

## 9. Testing requirements

Per the Engineering Reference standard (meaningful tests, not full coverage),
with the lessons of Phase 2 built in.

### 9.1 What must be tested, and where

| Layer | Tool | Required for |
|---|---|---|
| **Pure functions** | Jest unit, **no mocks** | Every rule in the state machine, the summary arithmetic, time conversion. Table-driven |
| **Real database** | e2e (`apps/api/test/*.e2e-spec.ts`) | **Every route.** Locks, constraints, isolation, the audit write, response shapes |
| **Screens** | Jest + Testing Library (`apps/web`) | Every component that calls the API, branches on state or role, or validates input |

**Do not mock Prisma to test attendance logic.** The original attendance tests
mocked it, checked that calls were *made*, and passed over three real bugs —
the summary was never created, break time was miscounted, and a filter
silently vanished. Test the arithmetic as pure functions and the database
behaviour against a real database.

### 9.2 Prove the test can fail

**A test you have not seen fail is not yet evidence.** For every guard you
write — a lock, a scope filter, an ownership check — break it on purpose, watch
the test fail by name, then restore it. Phase 3 examples:

| Broken on purpose | Test that caught it |
|---|---|
| Removed `FOR UPDATE` | *two simultaneous clock-ins record exactly one* — failed 3 of 3 |
| Put the `req.user.userId` bug back | *colleagues in the SAME company* — failed; the cross-company test **passed**, which is how the gap was found |
| Disabled the office rule-ownership check | *another company's rule to an office* — got 200 |
| Put the break-time bug back | 4 summary tests failed |

### 9.3 Commands

```bash
# API unit tests (~20 s)
pnpm --filter api test

# API typecheck — tests passing is NOT the same as the code building
cd apps/api && npx tsc --noEmit -p tsconfig.json

# API e2e against the TEST database (~20 min — run in the background)
pnpm --filter api test:e2e

# One e2e file, or one test by name
cd apps/api && npx jest --config test/jest-e2e.json --runInBand test/attendance.e2e-spec.ts
cd apps/api && npx jest --config test/jest-e2e.json --runInBand -t "two simultaneous"

# Web tests and typecheck
pnpm --filter web test
cd apps/web && npx tsc --noEmit -p tsconfig.json

# Lint the files you touched
cd apps/api && npx eslint src/attendance test/attendance.e2e-spec.ts
```

**Write long runs to a file**, never pipe them through `tail` — a buffered pipe
hid a 35-minute stall with no way to see it:

```bash
pnpm --filter api test:e2e > e2e.txt 2>&1
```

If an e2e run's `Time:` is in hours, the machine slept — discard it.

### 9.4 Writing an e2e test

Use the helpers in `apps/api/test/helpers/test-app.ts`:

```ts
import { createTestApp, httpServer, registerOrganization, TestContext } from './helpers/test-app';

let ctx: TestContext;
beforeAll(async () => { ctx = await createTestApp(); });
beforeEach(async () => { await ctx.reset(); });     // truncates every table
afterAll(async () => { await ctx.close(); });

it('refuses a second clock-in', async () => {
  const { accessToken } = await registerOrganization(ctx, {
    organizationName: 'Acme', email: 'a@test.local', adminName: 'Ada',
  });
  const punch = () => request(httpServer(ctx))
    .post('/api/attendance/clock-in')
    .set('Authorization', `Bearer ${accessToken}`);

  await punch().expect(201);
  await punch().expect(409);
});
```

For a second user with a specific role in the same organisation, see the
`colleague()` helper in `test/work-rules.e2e-spec.ts`.

**For lateness tests that do not depend on the time of day**, use a rule that
starts at 00:00 with no grace on every day — lateness is then exactly the
arrival minute, so the expected value is computable whenever the suite runs
(see *"lateness uses the configured rule"* in `attendance.e2e-spec.ts`).

---

## 10. Integration checklist

How the three pieces meet, in order. Tick each before the exit demo.

- [x] Migration 18 applied to dev and test (§13.2)
- [x] `POST /attendance/clock-in` returns a real punch against a real user
- [x] A second clock-in returns 409; two simultaneous ones record one
- [x] Company A's punches are invisible to company B **and** to A's other staff
- [x] `POST /work-rules` creates a default rule; lateness follows it
- [x] An office's rule beats the default; a holiday means nobody is late
- [x] Changing the organisation timezone moves which day a punch belongs to
- [ ] **Overtime definition decided** (§3) and the server and wizard agree
- [ ] Timezone picker sends `"Africa/Lagos"`, not `"WAT"`
- [ ] Setup wizard saves timezone (`PATCH /organization`) and working hours (`POST /work-rules`), and refuses overnight hours
- [x] Time-regulation and holidays pages read and write the real API; sample banners removed
- [x] `TodayStatusCard` reads `GET /attendance/today`; sessionStorage loop deleted
- [x] `ClockInFlow` → `POST /attendance/clock-in` (via `lib/attendance.ts`), with location
- [x] History page uses `GET /attendance/history` (not `/attendance/me`)
- [x] End-of-day job marks absences and flags unfinished days, idempotently
- [ ] **Staging database separate from development** (Phase 2's open gate)
- [ ] Deployed to staging; the demo below run there, not on a laptop
- [ ] Management has answered: are breaks paid?

---

## 11. Exit demo script

What gets shown live at the Phase 3 gate. Run it **on staging**. If any step is
not ready, *that* is the signal the phase is not done — not a date.

1. **As super admin:** set the organisation timezone; create a rule —
   Mon–Fri, 08:00–17:00, 10 minutes' grace; add a holiday.
2. **As an employee, on a working day:** clock in. Show the summary marked
   late or on time, and the lateness in minutes — check it against the clock
   by hand.
3. Start a break, end it, clock out. Show worked minutes and break minutes,
   and that the break was **subtracted**.
4. **Clock in again** — a second session — and out. Show the day's totals add
   up both sessions; first clock-in and last clock-out are right.
5. Try clocking out twice — show the refusal message.
6. **Tap clock-in twice quickly** (or two tabs) — show one punch recorded.
7. Open the history page — show the day, and the previous days.
8. **As a second employee** — show none of the first employee's punches.
9. Show the activity log — every punch and every rule change, with who and when.
10. **The next morning** (or with the job run manually): an employee who never
    clocked in shows **absent**; one who never clocked out shows **incomplete**,
    with **no invented clock-out**.

Afterwards, **write down** who attended, what they raised, and whether they
accepted it. A sign-off given in a meeting and not recorded is a gate still
open — Phase 2's still is.

---

## 12. Common pitfalls specific to attendance

**Never use the server's local time.** `new Date().getHours()`,
`setHours(0, 0, 0, 0)`, `getDay()` all answer for UTC on Render. Use
`localMoment(instant, org.timezone)` (§5.1). This was in the original module.

**Never trust a time from the client.** The punch time is the server's clock,
read after the lock. A request that sends a time is refused with 400 — keep it
that way.

**Never check-then-write without the lock.** Reading the state and inserting
are two steps; without `FOR UPDATE` in one transaction, double taps double-punch
(§5.2).

**Never `update` a summary that may not exist.** Use `upsert`. The first punch
of every day failed this way.

**Never count time before a break as break time.** It is the easiest bug in
the arithmetic to write and the most expensive to ship.

**Never read `req.user.userId`.** It does not exist; it is `req.user.id`. And
remember why that is dangerous rather than merely wrong: Prisma treats
`{ userId: undefined }` as no filter at all.

**Never let a request body choose a foreign id.** Anything that arrives in a
body and points at another record — `workRuleId`, `officeId`, `departmentId` —
must be checked against the caller's organisation before it is written. A
foreign key only proves the record exists *somewhere*.

**Never invent a punch.** A forgotten clock-out is flagged (`isIncomplete`),
never filled in. An inferred record is a fabricated record.

**Never edit a punch.** The database will refuse; do not look for a way round
it. Corrections are new events.

**Never parse Prisma's error metadata to decide what went wrong.** In Prisma 7,
`P2002`'s `meta.target` is not a field list under the pg driver adapter — that
made every duplicate rule name a 500. Ask the database directly ("does a rule
with this name exist?").

**Never register a module and forget `AppModule`.** The original attendance
module was written and tested but never added to `AppModule.imports`, so every
route 404'd — the same happened to Departments and Offices in Phase 2. The e2e
suite's first test for any new module should be *"the route returns 401, not
404, without a token"*.

**Remember the tests are slow from Lagos.** About 200 ms per database query to
Ohio. Interactive transactions are given 15 s rather than Prisma's 5 s default.
If e2e fails with *"Unable to start a transaction in the given time"*, measure
the connection before suspecting the code (§13.3).

---

## 13. Workflow: branches, migrations, commits

### 13.1 Branches

| Work | Branch | Then |
|---|---|---|
| Backend (`apps/api`, `prisma`, `packages`) | `testing` | Enoch merges `testing` into `frontend-testing` |
| Frontend (`apps/web`) | `frontend-testing` | |
| A larger piece | a feature branch off `testing`, e.g. `feat/day-close` | fast-forward into `testing` |

**Pull before you start, and often.** Two people pushing to the same branch
without pulling is how `frontend-testing` diverged on 15 October.

```bash
git pull --no-rebase origin frontend-testing
```

Plain `git pull` on a diverged branch stops with *"Need to specify how to
reconcile divergent branches"* after fetching — it looks like it worked and
did not.

**Do not build on an old branch.** `myDevTest` was based on 10 September and
100 commits behind; working from it would have meant losing most of Phase 2.
If your branch is more than a few days old, merge `testing` into it first.

### 13.2 Database migrations

This project connects through Neon's **pooled** endpoint, where `prisma migrate
dev` cannot build its shadow database — it misreads the PostGIS extension as
drift and **offers to wipe the database. Never accept that.**

The working procedure:

1. Change `prisma/schema.prisma`.
2. Generate the SQL:
   ```bash
   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
   ```
3. Write it to `prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql` by
   hand, with a header comment explaining it. Add anything Prisma cannot
   express (partial indexes, CHECKs, triggers) below, marked HAND-WRITTEN.
4. Rehearse it on the test database inside a transaction that rolls back —
   attack each protection and confirm it refuses (see the M1 rehearsal).
5. Apply to dev, then test:
   ```bash
   npx prisma migrate deploy
   DATABASE_URL="$(grep -E '^TEST_DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')" npx prisma migrate deploy
   npx prisma generate
   ```
6. Restart the API — Nest builds its routes and Prisma client at boot.

Prisma 7's `migrate deploy` has **no `--url` flag** — the URL comes only from
`prisma.config.ts`, which reads `DATABASE_URL`.

### 13.3 Running the API

```bash
pnpm --filter api start:dev
```

Port 8000. **Not `start`** — that runs the last *compiled* build in `dist/`,
which will not have your changes, and every new route 404s.

To measure the database connection properly (inside one connection — separate
`psql` calls each include TLS setup and overstate it ten-fold):

```bash
psql "$TEST_DATABASE_URL" -X -c '\timing on' -c 'select 1' -c 'select 1' -c 'select 1'
```

About 200 ms is normal from here.

### 13.4 Before you push

1. `npx tsc --noEmit -p tsconfig.json` — prints nothing.
2. Unit tests pass.
3. **e2e passes** if you touched anything a client can see — a route, a
   response shape, a status code, a guard, a cookie.
4. Lint clean on the files you touched.
5. Every new guard has been seen to fail.

---

## 14. File map

### Backend — `apps/api/src/`

| File | What it is |
|---|---|
| `attendance/attendance-time.ts` | Timezone conversion: `localMoment`, `toDbDate`, `isoWeekday`, `parseClockTime` |
| `attendance/attendance-state.ts` | The state machine: `stateFromPunches`, `refusalFor` |
| `attendance/day-summary.ts` | The summary arithmetic: `computeDaySummary`, `BREAKS_ARE_PAID` |
| `attendance/attendance.service.ts` | The punch transaction, `today`, `history` |
| `attendance/attendance.controller.ts` | The six routes |
| `attendance/dto/` | `PunchLocationDto`, `QueryAttendanceHistoryDto` |
| `work-rules/` | Work-rule CRUD |
| `holidays/` | Holiday CRUD and the per-year listing |
| `organization/` | `GET`/`PATCH /organization` |
| `offices/dto/update-office.dto.ts` | `workRuleId` on an office |
| `audit/audit.service.ts` | `AUDIT_ACTIONS` — add new actions here |
| `maintenance/token-cleanup.service.ts` | The pattern for M6's scheduled job |

### Tests

| File | Covers |
|---|---|
| `attendance/attendance-state.spec.ts` | All 16 state/action pairs |
| `attendance/attendance-time.spec.ts` | Day boundaries, DST, truncation |
| `attendance/day-summary.spec.ts` | FR-005/FR-006 as a table, incl. the PRTS example verbatim |
| `test/attendance.e2e-spec.ts` | The punch API: routes mounted, races, isolation, append-only, audit |
| `test/work-rules.e2e-spec.ts` | Rules, holidays, timezone, and how each feeds lateness |

### Frontend — `apps/web/src/`, to change in M2/M5

| File | Change |
|---|---|
| `app/components/onboarding/StepOrgProfile.tsx` | Timezone value `"WAT"` → `"Africa/Lagos"` |
| `app/onboarding/page.tsx` | `handleFinish`: save orgProfile and workRules |
| `lib/validation/onboarding.ts` | Refuse end before start |
| `lib/overtime.ts` | Align with the overtime decision |
| `app/dashboard/super-admin/time-regulation/page.tsx` | Real `/work-rules`; remove banner |
| `app/dashboard/super-admin/holidays/page.tsx` | Real `/holidays`; remove banner |
| `app/components/dashboard/clockInOutcome.ts` | Replace `submitClockIn` |
| `app/components/dashboard/ClockInFlow.tsx` | Send location; drop "screen only" text |
| `app/components/dashboard/TodayStatusCard.tsx` | `GET /attendance/today`; delete sessionStorage |
| `app/dashboard/employee/attendance/page.tsx` | `/attendance/me` → `/attendance/history` |

---

*Questions, or something here that turns out to be wrong: raise it with Enoch
before working around it. This manual is checked against the code as of 16
October 2026; where they disagree, the code is the truth and this manual
needs fixing.*
