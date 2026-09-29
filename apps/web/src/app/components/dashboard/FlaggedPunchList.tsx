"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  PunchReviewModal,
  type FlaggedPunch,
} from "@/app/components/dashboard/PunchReviewModal";

// The list of flagged punches plus its review modal, shared by HR's
// Review Queue (whole organization) and a Team Lead's Pending Exceptions
// (their department). The two pages differ only in which punches they
// pass in and what the empty state should say, so the row markup, the
// score colouring and the modal wiring live here once.

interface FlaggedPunchListProps {
  punches: FlaggedPunch[];
  emptyMessage: string;
}

// "Emeka Nwachukwu" -> "EN". Falls back to a single initial for
// one-word names rather than producing an empty circle.
function getInitials(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

// Matches the bands the review modal's score bar draws: below 60 would
// have been auto-rejected, 80 and above auto-approved.
function getScoreTone(score: number): string {
  if (score < 60) return "text-alert";
  if (score < 80) return "text-warning";
  return "text-success";
}

export function FlaggedPunchList({
  punches,
  emptyMessage,
}: FlaggedPunchListProps) {
  const [selectedPunch, setSelectedPunch] = useState<FlaggedPunch | null>(null);

  return (
    <>
      <div className="bg-surface border border-neutral/20 rounded-xl overflow-hidden">
        {punches.length === 0 && (
          <p className="px-6 py-10 text-center text-sm text-neutral">
            {emptyMessage}
          </p>
        )}

        {punches.map((punch) => (
          <div
            key={punch.id}
            className="flex flex-wrap items-center gap-4 px-5 py-4 border-b border-neutral/10 last:border-0"
          >
            {/* Who + when */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                {getInitials(punch.employeeName)}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-heading truncate">
                  {punch.employeeName}
                </p>
                <p className="text-[12px] text-neutral truncate">
                  {punch.timestamp} · {punch.department}
                </p>
              </div>
            </div>

            {/* Why it was flagged */}
            <p className="text-sm text-neutral flex-1 min-w-[16rem]">
              {punch.reason}
            </p>

            {/* Score + status + action */}
            <div className="flex items-center gap-3 shrink-0">
              <span
                title={`Trust score ${punch.trustScore} of 100`}
                className={`text-[17px] font-semibold tabular-nums ${getScoreTone(
                  punch.trustScore
                )}`}
              >
                {punch.trustScore}
              </span>

              <span className="inline-flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-[11px] font-medium text-warning">
                <AlertTriangle className="h-3 w-3" strokeWidth={2} />
                Flagged
              </span>

              <button
                type="button"
                onClick={() => setSelectedPunch(punch)}
                className="rounded-md border border-neutral/30 px-3 py-2 text-sm font-medium text-heading hover:bg-neutral/10"
              >
                Review
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedPunch && (
        <PunchReviewModal
          punch={selectedPunch}
          onClose={() => setSelectedPunch(null)}
        />
      )}
    </>
  );
}
