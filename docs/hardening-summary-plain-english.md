# SmartBioTrack — Security & Reliability Review

**Plain-English summary for non-technical readers**

**Covering:** 10–18 September 2026
**Technical detail:** `docs/hardening-log.md` (same findings, engineering language)

> Keep the two in step. If a finding closes, update both — otherwise the version
> management reads stops matching the version the engineers work from.

*The numbered items below are in the order they're easiest to explain, not the
order they were found. The engineering log numbers the same work differently —
item 14 here is #22 there, and item 15 is #25. If you're briefing from this
document and someone asks a technical follow-up, that's the mapping.*

**Most recent additions:** item 14 (the audit trail) and item 15 (one shared list
across both halves of the system) — both closed 18 September 2026.

---

## In one paragraph

We put Phase 2 through the kind of review an outside consultant would run before
a product goes live. We found **26 issues**, ranked by how badly each could hurt
us, and have fixed **16** — including every one we classed as urgent. The code
was in good shape to begin with; these are the gap between *working software* and
*software you can safely sell to a company that will trust it with staff records
and pay data*. The remaining 9 are known, written down, and ordered.

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

### 14. The "audit log" screen was a photograph, not a record

The system had a page titled **Audit Logs**, showing who did what and when. It
looked complete. Every line on it was invented — typed in by hand while the page
was being designed, and never connected to anything. Nothing the company actually
did was being recorded anywhere.

This is the most serious kind of gap, because it is *invisible in the wrong
direction*. A missing feature announces itself. A convincing screen that records
nothing lets everyone assume they're covered — right up to the day someone
disputes a month's pay and asks who removed them from the system.

Think of a shop's CCTV: a dummy camera on the wall is worse than no camera,
because the staff stop watching the door.

**Fixed.** Every meaningful action on a person is now written down permanently
the moment it happens — added, suspended, restored, removed, re-invited. Who did
it, to whom, from where, and exactly when.

Four things about how it was built are worth knowing, because they are the
difference between a record that holds up and one that doesn't:

- **If the record can't be written, the action doesn't happen.** Suspending
  someone and logging the suspension succeed or fail together. A log with
  occasional silent gaps is worse than useless, because it makes every absence
  look like proof that nothing occurred. We'd rather refuse the action.
- **Names are captured at the moment, not looked up later.** People get married,
  change roles, and leave. If the log looked names up when you read it, an entry
  from three years ago would describe today's org chart. It already proved
  itself: the first real entry reads *James White (EMP-PT7A8)* — and James has
  since been removed from the system. The entry still reads perfectly.
- **Nobody can edit or delete it.** Not administrators, not us. There is no
  button, and no hidden route to one. A record anyone can quietly amend is not
  evidence.
- **Only an Organisation Super Admin can read it.** Deliberately narrower than
  the staff list, which HR can see. This records what colleagues *did*, and HR
  staff appear in it themselves.

**One claim was removed.** The placeholder screen said the trail was
*"hash-chained and retained for 7 years"*. Neither was true — those words had
been written to look reassuring. The page now states only what the system
actually does. If a seven-year retention policy is a commitment we want to make
to customers, it should be a decision someone takes, with the work to back it —
not a sentence discovered on a screen during an audit.

---

### 15. The two halves of the system kept their own copies of the same list

The system is built in two halves: the part that runs on our servers and holds
the database, and the part that runs in the employee's browser. Both need to
agree on basic facts — what job titles exist, what states a staff record can be
in.

They didn't share that list. Each kept its own copy, typed out by hand, kept in
step by whoever remembered. We found **eight** such copies, and they had already
drifted apart in both directions:

- **The browser believed in a job title that doesn't exist.** A "Platform Admin"
  role had been added to the browser side — with its own menu, its own screens
  and its own permissions — for a role our servers have never been able to issue.
  Nobody could ever have that job title, so none of that work could ever run. It
  looked like a finished feature in the code and was unreachable.
- **The browser didn't know staff could be removed.** When "removed" was added as
  a staff state earlier this month, only the server learned about it. The browser
  still believed there were three states, not four.

The second one caused no visible harm — but only by luck, because removed staff
happen to be filtered out before the browser sees them. Change that filter and
the mistake surfaces.

Think of two departments working from separately photocopied price lists. Nothing
goes wrong until one is updated and the other isn't, and then nobody can tell
which is right.

**Fixed.** There is now one list, in one place, used by both halves.

**The important part is not the list — it's the alarm.** A shared list can drift
just as easily if nothing checks it. So the system now refuses to build if the
two sides disagree: not a warning in a log somewhere, but a hard stop, before the
code can be released. We tested it by deliberately reintroducing the fake job
title, confirming the build failed and named it, then putting things back.

A safety check nobody has ever seen trigger is not a safety check anyone should
trust. This one has been seen to trigger.

**What's still outstanding.** This solves it for simple lists. The two halves
also share more complicated structures — the full shape of a staff record, for
instance — and those need a different technique. Logged as a separate item (26)
rather than left implied.

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
- A finished page reported **"this page doesn't exist"** for half an hour, while
  the file sat plainly on disk. Combining the two halves of the work while the
  development server was still running left it holding an out-of-date map of the
  project. Clearing that map fixed it instantly. We now know the trigger, which
  is the part that stops it recurring — the earlier version of this note recorded
  only the symptom.

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
| Issues found | 26 |
| **Fixed** | **16** |
| Remaining | 9 |
| Deliberately not doing | 1 |

**All urgent items are closed.** Automated checks went from 87 to 254 — every
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
