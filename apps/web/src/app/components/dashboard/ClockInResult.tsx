"use client";

import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import {
  formatRecordedTime,
  type ClockInOutcome,
} from "@/app/components/dashboard/clockInOutcome";

interface ClockInResultProps {
  outcome: ClockInOutcome;
  onDone: () => void;
  /** Rejected only — goes back to the checks so the person can fix and retry. */
  onRetry: () => void;
}

// What the employee sees after tapping "Confirm clock-in". Three different
// screens on purpose: "recorded", "recorded but under review" and "not
// recorded" mean different things to the person, and flagged in particular
// must not look like a failure (their time IS being counted) or like a clean
// success (someone is going to look at it).
export function ClockInResult({
  outcome,
  onDone,
  onRetry,
}: ClockInResultProps) {
  // The server's UTC instant, shown in the viewer's own timezone with the
  // zone named. Rejected has no time — nothing was recorded.
  const time =
    outcome.status === "rejected" ? "" : formatRecordedTime(outcome.recordedAt);

  const view = {
    approved: {
      Icon: CircleCheck,
      tone: "bg-success/10 text-success",
      title: "You're clocked in",
      message: `Your clock-in was recorded at ${time}.`,
    },
    flagged: {
      Icon: TriangleAlert,
      tone: "bg-warning/15 text-warning",
      title: "Clocked in — pending review",
      message:
        "Your clock-in was recorded, but HR will review it before it is confirmed. You don't need to do anything.",
    },
    rejected: {
      Icon: CircleX,
      tone: "bg-alert/10 text-alert",
      title: "Clock-in not accepted",
      message: "Your clock-in was not recorded.",
    },
  }[outcome.status];

  const reasons = outcome.status === "approved" ? [] : outcome.reasons;

  return (
    <div role="status" className="text-center">
      <span
        className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${view.tone}`}
      >
        <view.Icon className="h-7 w-7" strokeWidth={2} />
      </span>

      <h3 className="mt-4 text-lg font-semibold text-heading">{view.title}</h3>
      <p className="mt-1 text-sm text-neutral">{view.message}</p>

      {reasons.length > 0 && (
        <ul className="mt-4 space-y-2 text-left">
          {reasons.map((reason) => (
            <li
              key={reason}
              className="rounded-lg border border-neutral/20 px-3 py-2 text-sm text-heading"
            >
              {reason}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-col gap-2">
        {outcome.status === "rejected" && (
          <button
            type="button"
            onClick={onRetry}
            className="w-full bg-primary text-white text-sm font-semibold py-3 rounded-md hover:bg-primary/90"
          >
            Try again
          </button>
        )}
        <button
          type="button"
          onClick={onDone}
          className={
            outcome.status === "rejected"
              ? "w-full border border-neutral/30 text-heading text-sm font-medium py-3 rounded-md hover:bg-neutral/10"
              : "w-full bg-primary text-white text-sm font-semibold py-3 rounded-md hover:bg-primary/90"
          }
        >
          {outcome.status === "rejected" ? "Close" : "Done"}
        </button>
      </div>

      <p className="mt-3 text-xs text-neutral">
        Saved to this screen only — no backend endpoint exists yet to record a
        real attendance punch.
      </p>
    </div>
  );
}
