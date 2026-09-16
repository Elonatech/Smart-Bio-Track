# SmartBioTrack — Security & Reliability Review

**Plain-English summary for non-technical readers**

**Covering:** 10–15 September 2026
**Technical detail:** `docs/hardening-log.md` (same findings, engineering language)

> Keep the two in step. If a finding closes, update both — otherwise the version
> management reads stops matching the version the engineers work from.

---

## In one paragraph

We put Phase 2 through the kind of review an outside consultant would run before
a product goes live. We found **25 issues**, ranked by how badly each could hurt
us, and have fixed **14** — including every one we classed as urgent. The code
was in good shape to begin with; these are the gap between *working software* and
*software you can safely sell to a company that will trust it with staff records
and pay data*. The remaining 10 are known, written down, and ordered.

---

## What was actually wrong, in ordinary terms

### 1. Team leaders could read the whole company's staff list

A team leader is meant to see their own team. The system was sending the browser
**every employee in the company** — names, emails, staff IDs, including HR and
directors — and then asking the browser to politely hide the rest.

*Think of it as* posting someone the entire personnel file with a note saying
"only read page 4". Anyone even slightly curious can read the rest, and no
special skill is needed.

**Fixed.** The server now sends only that leader's own team. The rest never
leaves the building.

---

### 2. A stolen browser session lasted a week

Login passes were kept in a part of the browser that any code running on the
page can read — including code that arrives through a compromised advert, a
hacked supplier, or a rogue browser extension. One bad moment and an attacker
held a pass valid for **seven days**.

*Think of it as* leaving the spare key under the mat. The front door lock is
excellent; it simply isn't the thing being tested.

**Fixed.** The long-lived pass is now stored where the browser itself holds it
and no code can read it — not ours, not anyone's.

---

### 3. If someone did steal a session, nothing noticed

Passes were being renewed correctly, but nothing watched for the tell-tale sign
of theft: **the same pass being used twice**. If a thief got in first, the real
employee was the one locked out, and no alarm went anywhere.

*Think of it as* two people turning up with the same boarding pass. Someone
should stop and investigate — instead, the system just turned away whoever
arrived second.

**Fixed.** A reused pass now ends that entire session immediately and writes a
record. There's a 30-second allowance first, because a normal person with two
browser tabs open genuinely does present the same pass twice a moment apart —
without that allowance we'd have been logging honest people out all day.

---

### 4. Deleting an employee destroyed records we're legally required to keep

Removing someone deleted their record outright. Phase 3 attaches attendance and
pay history to that record, so deleting a leaver would have taken **their entire
attendance history with them**.

*This one is a legal exposure, not an inconvenience.* Most countries require
employers to keep time-and-pay records for several years after someone leaves.
The single moment you need them is a dispute with a former employee — exactly
the person most likely to have been deleted.

**Fixed.** Removing someone ends their access instantly but keeps the record.
Nobody can delete their way out of a payroll dispute.

---

### 5. Anyone on the internet could check whether a person had an account

Our sign-up page answered differently depending on whether an email address was
already registered. That let anyone test addresses one at a time and learn who
does and doesn't have an account.

*For an attendance product, that's a staff list.* A competitor or recruiter could
work out who a customer employs.

**Fixed.** The page now gives the same answer either way. If the address is
already registered, the *email inbox* is told — so only the genuine owner finds
out.

---

### 6. A complete map of the system was published publicly

A developer documentation page was open to the internet with no login. It listed
every function of the system and exactly what each expects — useful while
building, and free reconnaissance for anyone planning an attack.

**Fixed.** Switched off outside development. We also now insist browsers only
ever connect over an encrypted connection.

---

### 7. The system would start up with a one-character password on its locks

The keys the system uses to sign login passes had no minimum strength, and —
more seriously — **nothing checked that two different keys weren't the same**.

Had someone ever set both to the same value, a seven-day pass would have worked
as a fifteen-minute one, quietly undoing the entire session-expiry design. The
system would have started up and behaved perfectly normally.

**Fixed.** It now refuses to start in that state.

---

### 8. Searches got slower the more customers we had

The database had no shortcuts for finding a company's staff, so every request to
list employees read **every employee row in the entire system** and discarded the
ones it didn't want.

*Think of it as* reading a whole phone book cover to cover to find one name. Fine
with twenty employees. At a hundred thousand it stops working, and takes
unrelated parts of the system down with it.

**Fixed.** Shortcuts added. One was added specifically for deleting an office —
an operation that looked instant in testing and would have frozen the system for
half a minute on a real customer.

---

### 9. The employee list downloaded the entire company at once

Opening the employee page fetched **every single employee** in one go. One
customer with five thousand staff would have produced a response large enough to
stall the whole system while it was assembled.

**Fixed.** The list now arrives a page at a time, with a search box wired to the
server.

Worth noting, because it shaped the work: paging *without* search would have made
things **worse**. Splitting five thousand people across two hundred pages with no
way to search means an administrator clicks through them looking for one person.
The two had to ship together.

---

### 10. Invitations could not be re-sent

When a new employee is added, the system emails them a link to set their
password. If that email was lost, expired, or went to spam, their account was
**stuck permanently** — and the only escape (deleting and re-adding them) stopped
working once we started keeping records properly.

The error message even told administrators to "re-send the invitation from the
user's profile" — a button that did not exist.

**Fixed.** The button exists now. There's a one-minute wait between sends so
nobody can be spammed, and an accidental double-click can't send two emails.

We also found the *Reset password* button was worse than useless for someone who
had never set one: it reported "reset email on its way" and sent nothing. It's
been replaced with *Resend invitation* for those people.

---

### 11. Two companies with the same name couldn't both sign up

The first customer to register as, say, "Sterling Ltd" took that name from every
other company of the same name — permanently, with no way round it except
inventing a name they don't trade under.

**Fixed.** Company names can now repeat. Nothing in the system needed them to be
unique.

---

### 12. Session records built up forever and nothing cleared them

Every time a user's session refreshed — roughly every fifteen minutes while
they're working — the system wrote a new row and never removed the old ones.
Around **ninety-six rows per person per day**, accumulating indefinitely, in a
table read on every single request.

**Fixed.** A housekeeping job now clears expired records every six hours.

---

### 13. Opening two browser tabs logged you out

A genuine, everyday annoyance rather than a security hole. Fixed alongside the
session-theft work.

---

## What this cost us

Roughly **five working days**, and a fair share of it was not spent on the code.

**About a day went to tooling problems**, not the product:

- The development server crashed in a loop for an hour, blaming a missing
  component. The component was fine — a temporary working file had been corrupted
  when a previous run was force-quit. **The error message pointed at entirely the
  wrong thing**, which is what made it expensive.
- The database tool repeatedly offered to **wipe the development database** —
  which holds test data the team built by hand over weeks — because of a quirk in
  how our hosting provider connects. The database was never actually at risk, but
  every update now needs a manual, deliberate route around it.
- GitHub demanded a browser sign-in on **every single push**, for days. The cause
  was a saved login for the wrong account: it could never work, so it asked again
  forever. Cleared now.

**We also made mistakes worth recording:**

- One fix was reported as finished when it wasn't. The quick checks passed, but
  the slower, more realistic tests were skipped — and those were the only ones
  that could have caught the problem. **Five tests were broken and nobody knew
  for a day.** The rule that came out of it: if a change alters how the system
  talks to the browser, the slow tests are not optional.
- A command run against the wrong branch briefly wiped three saved pieces of work.
  Nothing was lost — it was all recoverable — but the instruction that caused it
  was ambiguous, and it's been rewritten so it can't happen the same way twice.

None of this was wasted. Every one of these is now written down with the fix, so
the next person loses minutes instead of hours.

---

## Where we stand

| | |
|---|---|
| Issues found | 25 |
| **Fixed** | **14** |
| Remaining | 10 |
| Deliberately not doing | 1 |

**All urgent items are closed.** Automated checks went from 87 to 237 — every
fix has tests that will fail loudly if someone later undoes it by accident.

### What's left, and why it matters commercially

**Needs one piece of shared infrastructure (4 issues).** Today the system can
only run as a single copy. To run several — which is what gives you resilience
and lets you handle more customers — four things need to share information
between them, including login limits. **This is the work that stands between us
and being able to survive one server failing.**

**Protection against password guessing.** We limit attempts from a single
location, but a determined attacker spreading across many locations isn't
stopped. Worth closing before we hold real customer data.

**An activity trail.** The screen exists, but nothing is recorded behind it. For
a product handling attendance and pay, a permanent record of *who changed what,
and when* is what makes us defensible if a customer's employee disputes
something. **Worth treating as a sales requirement, not a technical nicety.**

**Re-hiring someone isn't possible yet.** Because we now keep leavers' records,
their email address stays reserved — so bringing someone back needs a
"reinstate" function we haven't built.

**Four smaller items** — a login timing quirk, a memory setting that could
destabilise a small server under a rush of logins, some tidying, and a mismatch
between what the screens expect and what the system provides.

---

## Recommendation

The urgent security work is done and the product is materially safer than it was
five days ago. Before onboarding a **real paying customer**, I'd want the
activity trail and the password-guessing protection closed. Before promising
**uptime commitments**, the shared-infrastructure work.

Nothing on the remaining list is a surprise or a blocker — it's all understood,
written down, and ordered.
