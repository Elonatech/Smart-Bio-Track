-- Phase 3: how overtime is counted, chosen per work rule.
--
-- Decided by Enoch on 27 Oct 2026: "work is set from 9 to 5, anything after
-- 5pm is tagged as overtime ... can it be flexible, cos if a company says you
-- should work 8 hours a day". So each rule picks:
--
--   END_TIME    — time worked after the rule's end time (the new default)
--   DAILY_HOURS — worked time beyond overtimeAfterMinutes
--   NONE        — overtime not tracked
--
-- Hand-written for the usual reason (Neon's pooled endpoint; see
-- 20261013090000_add_attendance_core). The first two statements are exactly
-- what `prisma migrate diff` produced. Apply with `prisma migrate deploy`.

-- CreateEnum
CREATE TYPE "OvertimeBasis" AS ENUM ('NONE', 'END_TIME', 'DAILY_HOURS');

-- AlterTable
ALTER TABLE "WorkRule" ADD COLUMN     "overtimeBasis" "OvertimeBasis" NOT NULL DEFAULT 'END_TIME';


-- ─── HAND-WRITTEN 1: existing rules keep their meaning ──────────────────────
--
-- Before this migration the only basis was "worked minutes beyond
-- overtimeAfterMinutes", and NULL meant "no overtime". The column default
-- (END_TIME) is right for rules created from now on, but applied to existing
-- rows it would silently change how their overtime is counted — so set them
-- to what they already meant. Without this, a rule that tracked no overtime
-- would start counting everything after its end time.

UPDATE "WorkRule"
SET "overtimeBasis" = CASE
  WHEN "overtimeAfterMinutes" IS NULL THEN 'NONE'::"OvertimeBasis"
  ELSE 'DAILY_HOURS'::"OvertimeBasis"
END;


-- ─── HAND-WRITTEN 2: DAILY_HOURS needs its threshold ────────────────────────
--
-- "Overtime after N hours" with no N would silently count nothing. Refuse it
-- when saved. (A threshold on an END_TIME or NONE rule is merely ignored, so
-- it is allowed; the API refuses that combination as contradictory.)

ALTER TABLE "WorkRule"
  ADD CONSTRAINT "WorkRule_daily_hours_needs_threshold"
    CHECK ("overtimeBasis" <> 'DAILY_HOURS' OR "overtimeAfterMinutes" IS NOT NULL);
