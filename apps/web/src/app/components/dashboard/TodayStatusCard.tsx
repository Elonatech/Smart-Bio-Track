"use client";

import { LogIn } from "lucide-react";

// The "Today's status" card that opens every role's overview. Every
// dashboard showed an identical copy of this markup, so a mobile layout
// fix had to be made in four places — hence one component.
//
// Clock In is disabled: there's no Attendance/Punch model in
// prisma/schema.prisma and no endpoint to record a punch, so a live-
// looking button would do nothing when tapped.
export function TodayStatusCard() {
  return (
    // Grid rather than flex so the three blocks can reflow between
    // layouts without duplicating any markup:
    //   mobile  — one column, stacked in DOM order:
    //             heading, then timer, then button
    //   sm and up — two columns: heading top-left, timer top-right,
    //             button beneath the heading
    // A flex row here is what broke the phone layout: the timer stayed
    // pinned to the right, squeezing "Not clocked in yet" onto two
    // lines and cramping the clock against the screen edge.
    <div className="grid gap-4 bg-surface border border-neutral/20 p-5 rounded-xl sm:grid-cols-[1fr_auto]">
      <div>
        <h5 className="text-xs font-medium tracking-wide uppercase text-neutral border-b border-neutral/30 inline-block pb-0.5">
          Today&apos;s status
        </h5>
        <p className="mt-2 text-[20px] sm:text-[22px] font-semibold text-heading">
          Not clocked in yet
        </p>
      </div>

      <div className="text-center sm:text-right sm:col-start-2 sm:row-start-1">
        <p className="text-[32px] leading-none font-bold text-heading tabular-nums">
          00:00:00
        </p>
        <p className="mt-2 text-xs text-neutral">
          Working hours today · break 00:00
        </p>
      </div>

      <div className="sm:col-start-1 sm:row-start-2">
        <button
          type="button"
          disabled
          title="Clock-in goes live once the attendance service ships — there's no endpoint to record a punch yet."
          className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-3 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LogIn className="h-4 w-4" strokeWidth={2} />
          Clock In
        </button>
      </div>
    </div>
  );
}
