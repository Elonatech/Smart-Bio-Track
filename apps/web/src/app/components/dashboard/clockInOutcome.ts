import { recordPunch, type PunchLocation } from "@/lib/attendance";

// The three results a clock-in attempt can have, per the roadmap's Trust Score
// Engine: approved (recorded), flagged (recorded, but HR must review it) and
// rejected (not recorded).
//
// `submitClockIn` below calls the real API. Only "approved" can come back from
// it until Phase 4 adds scoring; the reasons are plain strings because the
// real reason codes have not been agreed yet.
//
// `recordedAt` is the SERVER's timestamp as an ISO 8601 string in UTC
// ("2026-08-10T08:12:00.000Z"), never the browser's clock: the roadmap lists
// "server timestamp & replay protection" as a trust signal, and a device
// clock is the first thing someone cheating would change. Rejected has no
// recordedAt because nothing was recorded.
export type RecordedClockIn =
  | { status: "approved"; recordedAt: string }
  | { status: "flagged"; recordedAt: string; reasons: string[] };

export type ClockInOutcome =
  | RecordedClockIn
  | { status: "rejected"; reasons: string[] };

// Wording taken from the reasons already used in flaggedPunchSamples.ts, so
// the employee's screen and the reviewer's queue describe the same event the
// same way.
function previewOutcome(kind: "flagged" | "rejected"): ClockInOutcome {
  if (kind === "flagged") {
    return {
      status: "flagged",
      recordedAt: new Date().toISOString(),
      reasons: ["GPS accuracy below threshold (±184 m)"],
    };
  }
  return {
    status: "rejected",
    reasons: [
      "Not connected to an approved office network",
      "Identity could not be confirmed on this device",
    ],
  };
}

// Lets the flagged and rejected screens be seen and tested before a backend
// can produce them: add ?clockin-outcome=flagged (or rejected) to any
// dashboard URL. Dev builds only — in production the parameter is ignored,
// so a real user can never talk themselves into a fake outcome.
export function previewOutcomeFromUrl(): ClockInOutcome | null {
  if (process.env.NODE_ENV === "production") return null;
  const requested = new URLSearchParams(window.location.search).get(
    "clockin-outcome",
  );
  if (requested === "flagged" || requested === "rejected") {
    return previewOutcome(requested);
  }
  return null;
}

// POST /attendance/clock-in. `recordedAt` is the server's own timestamp from
// the saved punch.
//
// Always "approved" for now: Phase 3 records every clock-in and has no
// scoring yet, so the server never flags or rejects one. The flagged and
// rejected screens stay for Phase 4's Trust Score Engine, and the dev-only
// ?clockin-outcome= preview still shows them — WITHOUT calling the API, so a
// preview never records a real punch.
//
// A refusal from the server ("You are already clocked in.") throws; the
// caller shows its message.
export async function submitClockIn(
  location?: PunchLocation | null,
): Promise<ClockInOutcome> {
  const preview = previewOutcomeFromUrl();
  if (preview) return preview;

  const { punch } = await recordPunch("CLOCK_IN", location);
  return { status: "approved", recordedAt: punch.occurredAt };
}

// Turns a stored UTC instant into a time the reader can use: shown in THEIR
// timezone, with the zone named ("09:12 WAT"), so someone in London and
// someone in Lagos each read their own wall clock without either being wrong.
// `timeZone` exists for tests; the app always passes nothing (browser zone).
export function formatRecordedTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  }).format(new Date(iso));
}
