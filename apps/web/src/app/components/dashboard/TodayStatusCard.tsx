"use client";

import { useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { LogIn, LogOut, Coffee, Timer, RefreshCw } from "lucide-react";
import { ClockInFlow } from "@/app/components/dashboard/ClockInFlow";
import { formatRecordedTime } from "@/app/components/dashboard/clockInOutcome";
import { useToast } from "@/app/components/Toast";
import { extractErrorMessage } from "@/lib/api-client";
import {
  fetchToday,
  punchErrorMessage,
  readPositionQuietly,
  recordPunch,
  timeFromPunches,
  type PunchType,
  type TodayAttendance,
} from "@/lib/attendance";

// The "Today's status" card that opens every role's overview. Every
// dashboard showed an identical copy of this markup, so a mobile layout
// fix had to be made in four places — hence one component.
//
// REAL since Phase 3: state comes from GET /attendance/today, and clock-in
// (via ClockInFlow), breaks and clock-out are recorded punches. The server
// is the source of truth — its state machine decides what's allowed, and
// every time shown is the server's timestamp, never the browser's clock.
// (This used to be a local-only demo loop kept in sessionStorage.)
function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

type CardPunch = Exclude<PunchType, "CLOCK_IN">;

// Mirrors the server's state machine (attendance-state.ts) for the
// optimistic update; the server's answer always wins.
const NEXT_STATE: Record<CardPunch, TodayAttendance["state"]> = {
  BREAK_START: "ON_BREAK",
  BREAK_END: "CLOCKED_IN",
  CLOCK_OUT: "CLOCKED_OUT",
};

const PUNCH_TOAST: Record<CardPunch, [string, string]> = {
  BREAK_START: ["Break started", "Working hours pause until you end your break."],
  BREAK_END: ["Break ended", "Working hours have resumed."],
  CLOCK_OUT: ["Clocked out", "Your hours for today are saved."],
};

function MiniStat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-start gap-3 bg-surface border border-neutral/20 rounded-xl p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide uppercase text-neutral">{label}</p>
        <p className="mt-1 text-lg font-semibold text-heading tabular-nums">{value}</p>
        {sub && <p className="text-xs text-neutral">{sub}</p>}
      </div>
    </div>
  );
}

export function TodayStatusCard() {
  const toast = useToast();
  const [today, setToday] = useState<TodayAttendance | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<CardPunch | null>(null);
  const [isClockInOpen, setIsClockInOpen] = useState(false);

  // State is only ever set when the request settles — never synchronously
  // inside the effect, which React's lint rule rightly flags.
  const load = useCallback(() => {
    fetchToday()
      .then((data) => {
        setToday(data);
        setLoadError(null);
      })
      .catch((error) => setLoadError(extractErrorMessage(error)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const state = today?.state ?? "NOT_STARTED";
  const punches = today?.punches ?? [];
  const isClockedIn = state === "CLOCKED_IN" || state === "ON_BREAK";
  const isOnBreak = state === "ON_BREAK";

  // Re-render once a second while a shift is open, so the timer derived
  // from the punch times below advances. Stops when clocked out, so the
  // final numbers freeze.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isClockedIn) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isClockedIn]);

  const { workedSeconds, breakSeconds: totalBreakSeconds } = timeFromPunches(
    punches,
    new Date()
  );
  const firstClockIn = punches.find((p) => p.type === "CLOCK_IN");
  const lastClockOut =
    state === "CLOCKED_OUT"
      ? [...punches].reverse().find((p) => p.type === "CLOCK_OUT")
      : undefined;

  async function handlePunch(type: CardPunch) {
    setPending(type);
    // Optimistic: show the new state at once. A punch takes the server
    // ~1–2 s (six queries to Neon — see TRANSACTION_OPTIONS in
    // attendance.service.ts), and a button stuck on "Saving…" for that long
    // reads as broken. The placeholder uses the browser's clock only until
    // the re-read below swaps in the server's real timestamp; a refusal
    // re-reads too, which puts the card back.
    setToday((current) =>
      current && {
        ...current,
        state: NEXT_STATE[type],
        punches: [
          ...current.punches,
          { id: "pending", type, occurredAt: new Date().toISOString() },
        ],
      }
    );
    try {
      // Best effort and brief: location helps the audit trail but must
      // never be the reason a punch is slow or fails.
      const location = await readPositionQuietly(1000);
      await recordPunch(type, location);
      toast.success(...PUNCH_TOAST[type]);
    } catch (error) {
      toast.error("That didn't go through", punchErrorMessage(error));
    } finally {
      setPending(null);
      // Re-read either way: on success it replaces the placeholder with the
      // server's punch, and on a refusal ("You are already on a break.") it
      // restores what's really recorded — another tab or device may have
      // punched since.
      load();
    }
  }

  if (loadError && !today) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-neutral/20 p-5 rounded-xl">
        <div className="min-w-0">
          <p className="text-sm font-medium text-heading">
            Couldn&apos;t load today&apos;s attendance
          </p>
          <p className="text-xs text-neutral mt-0.5 wrap-break-word">{loadError}</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 border border-neutral/30 text-heading text-sm font-medium px-4 py-2 rounded-md hover:bg-neutral/10"
        >
          <RefreshCw className="h-4 w-4" strokeWidth={2} />
          Try again
        </button>
      </div>
    );
  }

  const isLoading = today === null;

  return (
    // No items-* override here: default align-items (stretch) is
    // deliberate — the mini-stat column is taller than this card's own
    // content, and stretching the CARD to match makes the two boxes end
    // on the same bottom line instead of one trailing off short with
    // dead page background beneath it. See the inner div's comment for
    // how that stretched height gets spent without inflating the buttons.
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      {/* content-start (not the default stretch) stops THIS grid's rows
          from being stretched to fill the taller box the outer stretch
          just gave it — the status/timer row and the button row keep
          their natural, compact height instead of that space feeding into
          the button row and inflating the actual <button> elements (which
          is exactly what plain "stretch" all the way down did before).
          Below lg there is no outer stretch to begin with (see the note
          above), so content-start there is a no-op either way.
          lg:content-between then spends that leftover room deliberately:
          it pushes the button row down towards the bottom of the now-
          matched height instead of leaving it all stranded below the
          buttons as one block — closer to the rhythm of the mini-stat
          column beside it, which is the actual visual complaint. */}
      <div className="grid content-start lg:content-between gap-4 bg-surface border border-neutral/20 p-5 rounded-xl sm:grid-cols-[1fr_auto]">
        <div>
          <h5 className="text-xs font-medium tracking-wide uppercase text-neutral border-b border-neutral/30 inline-block pb-0.5">
            Today&apos;s status
          </h5>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-[20px] sm:text-[22px] font-semibold text-heading">
              {isLoading
                ? "Loading…"
                : state === "CLOCKED_OUT"
                  ? "Clocked Out"
                  : isClockedIn
                    ? "Clocked In"
                    : "Not clocked in yet"}
            </p>
            {isClockedIn && !isOnBreak && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 text-success text-xs font-medium px-2 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Present
              </span>
            )}
            {isOnBreak && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 text-warning text-xs font-medium px-2 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                On break
              </span>
            )}
          </div>
        </div>

        <div className="text-center sm:text-right sm:col-start-2 sm:row-start-1">
          <p className="text-[32px] leading-none font-bold text-heading tabular-nums">
            {formatElapsed(workedSeconds)}
          </p>
          <p className="mt-2 text-xs text-neutral">
            Working hours today · break {formatElapsed(totalBreakSeconds)}
          </p>
        </div>

        <div className="sm:col-start-1 sm:row-start-2 flex flex-wrap gap-3">
          {/* Also shown after clocking out: the server allows a second
              shift the same day. */}
          {!isLoading && !isClockedIn && (
            <button
              type="button"
              onClick={() => setIsClockInOpen(true)}
              className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-3 rounded-md hover:bg-primary/90"
            >
              <LogIn className="h-4 w-4" strokeWidth={2} />
              Clock In
            </button>
          )}

          {isClockedIn && (
            <>
              <button
                type="button"
                onClick={() => handlePunch(isOnBreak ? "BREAK_END" : "BREAK_START")}
                disabled={pending !== null}
                className="inline-flex items-center gap-2 border border-neutral/30 text-heading text-sm font-medium px-4 py-2 rounded-md hover:bg-neutral/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Coffee className="h-4 w-4" strokeWidth={2} />
                {/* No "Saving…": the card already shows the new state
                    (optimistic), and `disabled` above stops a double tap
                    sending a second punch while the first is in flight. */}
                {isOnBreak ? "End Break" : "Start Break"}
              </button>
              <button
                type="button"
                onClick={() => handlePunch("CLOCK_OUT")}
                // The server refuses clock-out mid-break; say so up front.
                disabled={pending !== null || isOnBreak}
                title={isOnBreak ? "End your break before clocking out." : undefined}
                className="inline-flex items-center gap-2 border border-alert/30 text-alert text-sm font-medium px-4 py-2 rounded-md hover:bg-alert/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <LogOut className="h-4 w-4" strokeWidth={2} />
                Clock Out
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-4">
        <MiniStat
          icon={LogIn}
          label="Clock-in time"
          value={firstClockIn ? formatRecordedTime(firstClockIn.occurredAt) : "—"}
        />
        <MiniStat
          icon={LogOut}
          label="Clock-out time"
          value={lastClockOut ? formatRecordedTime(lastClockOut.occurredAt) : "—"}
        />
        <MiniStat
          icon={Timer}
          label="Working hours today"
          value={formatElapsed(workedSeconds)}
          sub={`Break ${formatElapsed(totalBreakSeconds)}`}
        />
      </div>

      {isClockInOpen && (
        <ClockInFlow
          onClose={() => setIsClockInOpen(false)}
          // The punch is already saved; re-read so the card shows the
          // server's state rather than a guess.
          onConfirmed={() => load()}
        />
      )}
    </div>
  );
}
