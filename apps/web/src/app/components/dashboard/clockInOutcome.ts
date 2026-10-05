// The three results a clock-in attempt can have, per the roadmap's Trust Score
// Engine: approved (recorded), flagged (recorded, but HR must review it) and
// rejected (not recorded).
//
// UI-only for now. There is no attendance endpoint, so nothing here is a
// server response — `submitClockIn` below is a local stand-in that always
// approves, and it is the single function to replace with the real call.
// When the backend contract exists, these types are what should move into
// packages/types; the reasons are plain strings because the real reason
// codes have not been agreed yet.
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

// Local stand-in for POST /attendance/clock-in. The short delay is
// deliberate: an instant result reads as the button doing nothing. The
// timestamp here comes from the browser only because there is no server to
// supply it — the real response replaces this whole function.
export async function submitClockIn(): Promise<ClockInOutcome> {
  await new Promise((resolve) => setTimeout(resolve, 600));
  return (
    previewOutcomeFromUrl() ?? {
      status: "approved",
      recordedAt: new Date().toISOString(),
    }
  );
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
