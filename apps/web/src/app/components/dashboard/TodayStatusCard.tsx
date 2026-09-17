"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { LogIn, LogOut, Coffee, Timer } from "lucide-react";
import { ClockInFlow } from "@/app/components/dashboard/ClockInFlow";
import { useToast } from "@/app/components/Toast";

// The "Today's status" card that opens every role's overview. Every
// dashboard showed an identical copy of this markup, so a mobile layout
// fix had to be made in four places — hence one component.
//
// Clock In opens ClockInFlow, which does a REAL geolocation + geo-fence
// check against the organization's actual offices — no backend needed for
// that part. Everything below (break, clock-out, the running timer) is
// LOCAL-ONLY state, the same pattern every other backend-less feature in
// this app uses (Work Rules, Holidays, Departments before their
// endpoints existed): there is no Attendance/Punch model in
// prisma/schema.prisma and no endpoint to record any of this against, so
// nothing here survives a refresh — it exists so the whole clock-in →
// break → clock-out loop can be seen and demoed end to end instead of
// dead-ending at a permanently disabled button.
function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

function formatClockTime(date: Date): string {
  return `${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} WAT`;
}

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
  const [isClockInOpen, setIsClockInOpen] = useState(false);
  const [clockedInAt, setClockedInAt] = useState<Date | null>(null);
  const [clockedOutAt, setClockedOutAt] = useState<Date | null>(null);
  const [breakStartedAt, setBreakStartedAt] = useState<Date | null>(null);
  // Only COMPLETED breaks — the one currently in progress, if any, is
  // computed live in render from breakStartedAt instead of stored here.
  const [completedBreakSeconds, setCompletedBreakSeconds] = useState(0);

  const isClockedIn = clockedInAt !== null && clockedOutAt === null;
  const isOnBreak = breakStartedAt !== null;

  // A tick counter rather than storing "elapsed seconds" directly — the
  // actual numbers below are always derived fresh from the real
  // timestamps, this just forces a re-render once a second so those
  // derivations produce a new value. Stops entirely once clocked out, so
  // the final numbers freeze instead of continuing to advance against
  // "now" after the shift has already ended.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isClockedIn) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isClockedIn]);

  const referenceNow = clockedOutAt ?? new Date();
  const totalElapsedSeconds = clockedInAt
    ? (referenceNow.getTime() - clockedInAt.getTime()) / 1000
    : 0;
  const currentBreakSeconds = breakStartedAt
    ? (referenceNow.getTime() - breakStartedAt.getTime()) / 1000
    : 0;
  const totalBreakSeconds = completedBreakSeconds + currentBreakSeconds;
  const workedSeconds = totalElapsedSeconds - totalBreakSeconds;

  function handleStartBreak() {
    setBreakStartedAt(new Date());
    toast.success("Break started successfully", "Working hours pause until you end your break.");
  }

  function handleEndBreak() {
    if (!breakStartedAt) return;
    setCompletedBreakSeconds(
      (prev) => prev + (Date.now() - breakStartedAt.getTime()) / 1000
    );
    setBreakStartedAt(null);
    toast.success("Break ended successfully", "Working hours have resumed.");
  }

  function handleClockOut() {
    // Ending the shift implicitly ends any break still running — folded
    // into the total rather than losing it or leaving isOnBreak stuck true
    // after clocking out.
    if (breakStartedAt) {
      setCompletedBreakSeconds(
        (prev) => prev + (Date.now() - breakStartedAt.getTime()) / 1000
      );
      setBreakStartedAt(null);
    }
    setClockedOutAt(new Date());
    toast.success(
      "Clocked out successfully",
      "Saved to this screen only — there is no backend endpoint yet to record a real punch."
    );
  }

  // Resets everything so the loop can be run through again without a page
  // refresh — useful for demoing or testing repeatedly, and there is no
  // real daily-limit concept to enforce since none of this is persisted.
  function handleStartNewShift() {
    setClockedInAt(null);
    setClockedOutAt(null);
    setBreakStartedAt(null);
    setCompletedBreakSeconds(0);
    setIsClockInOpen(true);
  }

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
            Today's status
          </h5>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-[20px] sm:text-[22px] font-semibold text-heading">
              {clockedOutAt ? "Clocked Out" : isClockedIn ? "Clocked In" : "Not clocked in yet"}
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
          {!clockedInAt && !clockedOutAt && (
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
                onClick={isOnBreak ? handleEndBreak : handleStartBreak}
                className="inline-flex items-center gap-2 border border-neutral/30 text-heading text-sm font-medium px-4 py-2 rounded-md hover:bg-neutral/10"
              >
                <Coffee className="h-4 w-4" strokeWidth={2} />
                {isOnBreak ? "End Break" : "Start Break"}
              </button>
              <button
                type="button"
                onClick={handleClockOut}
                className="inline-flex items-center gap-2 border border-alert/30 text-alert text-sm font-medium px-4 py-2 rounded-md hover:bg-alert/10"
              >
                <LogOut className="h-4 w-4" strokeWidth={2} />
                Clock Out
              </button>
            </>
          )}

          {clockedOutAt && (
            <button
              type="button"
              onClick={handleStartNewShift}
              className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-3 rounded-md hover:bg-primary/90"
            >
              <LogIn className="h-4 w-4" strokeWidth={2} />
              Clock In
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-4">
        <MiniStat
          icon={LogIn}
          label="Clock-in time"
          value={clockedInAt ? formatClockTime(clockedInAt) : "—"}
        />
        <MiniStat
          icon={LogOut}
          label="Clock-out time"
          value={clockedOutAt ? formatClockTime(clockedOutAt) : "—"}
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
          onConfirmed={() => setClockedInAt(new Date())}
        />
      )}
    </div>
  );
}
