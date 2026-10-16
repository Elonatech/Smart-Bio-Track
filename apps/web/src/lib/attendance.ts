import { appClient } from "@/lib/api-client";

// The attendance API (apps/api/src/attendance), Phase 3. Every route acts on
// the signed-in caller only — there is no user id to pass.
//
// Shapes mirror attendance.service.ts (PUNCH_SELECT, SUMMARY_SELECT and what
// today()/punch() return). Move them into packages/types once the backend
// exports them there.

export type AttendanceState = "NOT_STARTED" | "CLOCKED_IN" | "ON_BREAK" | "CLOCKED_OUT";

export type PunchType = "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END";

export interface Punch {
  id: string;
  type: PunchType;
  /** Server time, UTC ISO string. Never the browser's clock. */
  occurredAt: string;
}

export interface TodayAttendance {
  /** The organisation's local date, "YYYY-MM-DD". */
  workDate: string;
  timeZone: string;
  state: AttendanceState;
  /** Oldest first. */
  punches: Punch[];
}

export interface PunchResult {
  state: AttendanceState;
  punch: Punch;
}

/** What the browser says about where the person is. Optional by design. */
export interface PunchLocation {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

const PUNCH_PATH: Record<PunchType, string> = {
  CLOCK_IN: "/attendance/clock-in",
  CLOCK_OUT: "/attendance/clock-out",
  BREAK_START: "/attendance/break-start",
  BREAK_END: "/attendance/break-end",
};

export async function fetchToday(): Promise<TodayAttendance> {
  const { data } = await appClient.get<TodayAttendance>("/attendance/today");
  return data;
}

/**
 * Records a punch. Location is sent when known — the server records it but
 * doesn't refuse on it yet (Phase 3 decision 6). A refusal from the state
 * machine ("You are already clocked in.") comes back as a 409 whose message is
 * written for the person, so callers can show it as-is.
 */
export async function recordPunch(
  type: PunchType,
  location?: PunchLocation | null,
): Promise<PunchResult> {
  const { data } = await appClient.post<PunchResult>(PUNCH_PATH[type], location ?? {});
  return data;
}

/**
 * Worked and break time so far today, in seconds, from the punch list.
 *
 * Computed from punches rather than the server's summary minutes so the timer
 * can tick by the second between punches. `now` closes whatever interval is
 * still open (clocked in, or on a break).
 */
export function timeFromPunches(punches: readonly Punch[], now: Date) {
  let workedMs = 0;
  let breakMs = 0;
  let workingSince: number | null = null;
  let breakSince: number | null = null;

  for (const punch of punches) {
    const at = Date.parse(punch.occurredAt);
    switch (punch.type) {
      case "CLOCK_IN":
      case "BREAK_END":
        if (breakSince !== null) breakMs += at - breakSince;
        breakSince = null;
        workingSince = at;
        break;
      case "BREAK_START":
        if (workingSince !== null) workedMs += at - workingSince;
        workingSince = null;
        breakSince = at;
        break;
      case "CLOCK_OUT":
        if (workingSince !== null) workedMs += at - workingSince;
        workingSince = null;
        break;
    }
  }

  const end = now.getTime();
  if (workingSince !== null) workedMs += Math.max(0, end - workingSince);
  if (breakSince !== null) breakMs += Math.max(0, end - breakSince);

  return { workedSeconds: workedMs / 1000, breakSeconds: breakMs / 1000 };
}

/**
 * The browser's position, or null — never throws, never waits long.
 *
 * For clock-out and breaks, where location is useful for the audit trail but
 * must never be the reason a punch fails. (Clock-in does its own, stricter
 * location step in ClockInFlow.)
 */
export function readPositionQuietly(timeoutMs = 4000): Promise<PunchLocation | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
