"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  CircleCheck,
  CircleX,
  X,
} from "lucide-react";

// Detail view for one flagged punch. UI only — there is no attendance
// backend (no Punch model in prisma/schema.prisma, no module in
// apps/api/src), so the three decision controls are rendered but
// disabled. The note-required-to-reject rule is still implemented and
// still shows its hint, so the behaviour is ready the day an endpoint
// exists rather than being bolted on later.
const DECISIONS_ENABLED = false;
const NO_ENDPOINT_HINT = "No endpoint records a review decision yet.";

// Score bands the trust engine uses to route a punch. Anything in the
// middle band lands in the review queue, which is why the modal shows
// where the score sits rather than just printing the number.
const BAND_REVIEW_MIN = 60;
const BAND_APPROVE_MIN = 80;

export type SignalStatus = "PASS" | "WARN" | "FAIL";

export interface PunchSignal {
  label: string;
  detail: string;
  status: SignalStatus;
}

export interface FlaggedPunch {
  id: string;
  reference: string;
  employeeName: string;
  timestamp: string;
  department: string;
  device: string;
  deviceRegistered: string;
  locationName: string;
  reason: string;
  trustScore: number;
  // All three in metres — the geo-fence diagram maps them to a shared
  // pixel scale so they stay comparable.
  geoFenceRadius: number;
  distanceFromCentre: number;
  gpsAccuracy: number;
  signals: PunchSignal[];
}

const SIGNAL_META: Record<
  SignalStatus,
  { icon: typeof CircleCheck; className: string }
> = {
  PASS: { icon: CircleCheck, className: "text-success" },
  WARN: { icon: AlertTriangle, className: "text-warning" },
  FAIL: { icon: CircleX, className: "text-alert" },
};

interface PunchReviewModalProps {
  punch: FlaggedPunch;
  onClose: () => void;
}

export function PunchReviewModal({ punch, onClose }: PunchReviewModalProps) {
  const [notes, setNotes] = useState("");
  const [showPassed, setShowPassed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Split once rather than filtering three times in the markup. The
  // problems come first because that's the question the modal exists to
  // answer — the passed checks are reassurance, not the case.
  const concerns = punch.signals.filter((s) => s.status !== "PASS");
  const passed = punch.signals.filter((s) => s.status === "PASS");

  // Rejecting writes an audit entry, and one with no justification is
  // useless to whoever reads it later. Approve stays ungated.
  const hasNote = notes.trim().length > 0;

  useEffect(() => {
    // Remember where focus was so it can go back to the Review button
    // when the modal closes — otherwise a keyboard user is dumped at
    // the top of the document.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    // The page behind shouldn't scroll while the modal is open.
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      // Focus trap: collect what's actually focusable right now
      // (disabled controls are excluded automatically) and wrap Tab
      // around the ends so focus can't escape to the page behind.
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="punch-review-title"
        tabIndex={-1}
        // Clicks inside must not bubble up to the backdrop's close
        // handler.
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-surface rounded-xl border border-neutral/20 outline-none"
      >
        {/* Header — stays put while the body scrolls */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-neutral/20 shrink-0">
          <div className="min-w-0">
            <h2
              id="punch-review-title"
              className="text-lg font-semibold text-heading truncate"
            >
              Punch {punch.reference} — {punch.employeeName}
            </h2>
            <p className="text-[13px] text-neutral mt-1">
              {punch.timestamp} · {punch.device} · registered{" "}
              {punch.deviceRegistered} · {punch.locationName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-neutral hover:text-heading shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body — the only scrolling region */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <GeoFenceDiagram punch={punch} />

          <div className="mt-6">
            <TrustScoreBar score={punch.trustScore} />
          </div>

          {/* Why it was flagged, first and uncollapsed. */}
          <h3 className="mt-6 text-xs font-medium tracking-wide uppercase text-neutral border-b border-neutral/30 inline-block pb-0.5">
            Why this was flagged
          </h3>
          <ul className="mt-3 space-y-2.5">
            {concerns.map((signal) => (
              <SignalRow key={signal.label} signal={signal} />
            ))}
          </ul>

          {/* Reassurance, collapsed — it's not what the decision turns on. */}
          <button
            type="button"
            onClick={() => setShowPassed((prev) => !prev)}
            aria-expanded={showPassed}
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-neutral hover:text-heading"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                showPassed ? "rotate-180" : ""
              }`}
              strokeWidth={1.75}
            />
            Passed checks ({passed.length})
          </button>

          {showPassed && (
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
              {passed.map((signal) => (
                <SignalRow key={signal.label} signal={signal} />
              ))}
            </ul>
          )}

          <div className="mt-6">
            <label
              htmlFor="punch-review-notes"
              className="block text-sm font-medium text-heading mb-2"
            >
              Internal notes
            </label>
            <textarea
              id="punch-review-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="What did you check, and who confirmed it?"
              className="w-full rounded-md border border-neutral/40 px-3 py-2 text-sm text-heading bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="mt-1.5 text-[12px] text-neutral">
              Required to reject — a rejection with no reason is useless in the
              audit trail.
            </p>
          </div>
        </div>

        {/* Footer — stays reachable no matter how long the body gets */}
        <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4 border-t border-neutral/20 shrink-0">
          <select
            defaultValue="EMPLOYEE"
            disabled={!DECISIONS_ENABLED}
            aria-label="Who to request more information from"
            title={DECISIONS_ENABLED ? undefined : NO_ENDPOINT_HINT}
            className="rounded-md border border-neutral/30 px-3 py-2.5 text-sm text-heading bg-surface disabled:opacity-50 disabled:cursor-not-allowed mr-auto"
          >
            <option value="EMPLOYEE">Ask the employee</option>
            <option value="TEAM_LEAD">Ask their team lead</option>
          </select>

          <button
            type="button"
            disabled={!DECISIONS_ENABLED}
            title={DECISIONS_ENABLED ? undefined : NO_ENDPOINT_HINT}
            className="rounded-md border border-neutral/30 px-4 py-2.5 text-sm font-medium text-heading hover:bg-neutral/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            Request more information
          </button>

          <button
            type="button"
            disabled={!DECISIONS_ENABLED || !hasNote}
            title={
              !DECISIONS_ENABLED
                ? NO_ENDPOINT_HINT
                : hasNote
                  ? undefined
                  : "Add an internal note explaining the rejection."
            }
            className="rounded-md bg-alert text-white px-4 py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reject
          </button>

          <button
            type="button"
            disabled={!DECISIONS_ENABLED}
            title={DECISIONS_ENABLED ? undefined : NO_ENDPOINT_HINT}
            className="rounded-md bg-primary text-white px-4 py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}

function SignalRow({ signal }: { signal: PunchSignal }) {
  const { icon: Icon, className } = SIGNAL_META[signal.status];
  return (
    <li className="flex items-start gap-2.5">
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${className}`} strokeWidth={2} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-heading">{signal.label}</p>
        <p className="text-[12px] text-neutral">{signal.detail}</p>
      </div>
    </li>
  );
}

// Where the score sits relative to the policy that flagged it. A number
// in a ring can't show that a 68 is only two points off auto-rejection.
function TrustScoreBar({ score }: { score: number }) {
  const band =
    score >= BAND_APPROVE_MIN
      ? { label: "High trust — would auto-approve", className: "text-success" }
      : score >= BAND_REVIEW_MIN
        ? { label: "Medium trust — flagged for review", className: "text-warning" }
        : { label: "Low trust — would auto-reject", className: "text-alert" };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-medium tracking-wide uppercase text-neutral">
          Trust score
        </h3>
        <p className={`text-sm font-medium ${band.className}`}>{band.label}</p>
      </div>

      <div className="flex items-center gap-4 mt-2">
        <p className="text-[32px] leading-none font-semibold text-heading tabular-nums shrink-0">
          {score}
          <span className="text-sm font-normal text-neutral"> / 100</span>
        </p>

        <div className="flex-1 min-w-0">
          {/* Three bands sized by their share of the 0-100 range, so the
              widths stay honest if the thresholds ever change. */}
          <div className="relative h-2.5 flex rounded-full overflow-hidden">
            <div
              style={{ width: `${BAND_REVIEW_MIN}%` }}
              className="bg-alert/30"
            />
            <div
              style={{ width: `${BAND_APPROVE_MIN - BAND_REVIEW_MIN}%` }}
              className="bg-warning/30"
            />
            <div
              style={{ width: `${100 - BAND_APPROVE_MIN}%` }}
              className="bg-success/30"
            />
          </div>

          {/* Marker sits on top so it reads against whichever band it
              lands in. */}
          <div className="relative h-0">
            <div
              style={{ left: `${score}%` }}
              className="absolute -top-4 -translate-x-1/2 h-5 w-1 rounded-full bg-heading"
            />
          </div>

          <div className="relative mt-2 h-4 text-[11px] text-neutral tabular-nums">
            <span className="absolute left-0">0</span>
            <span
              style={{ left: `${BAND_REVIEW_MIN}%` }}
              className="absolute -translate-x-1/2"
            >
              {BAND_REVIEW_MIN}
            </span>
            <span
              style={{ left: `${BAND_APPROVE_MIN}%` }}
              className="absolute -translate-x-1/2"
            >
              {BAND_APPROVE_MIN}
            </span>
            <span className="absolute right-0">100</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Two circles, not a map: the geo-fence, and the GPS error margin around
// where the punch was recorded. When the error circle spills outside the
// fence, that IS the ambiguity being judged — a tile map would look
// authoritative while showing less, and would need a provider and an API
// key besides.
function GeoFenceDiagram({ punch }: { punch: FlaggedPunch }) {
  const VIEW_W = 640;
  const VIEW_H = 260;
  const cx = VIEW_W / 2;
  const cy = VIEW_H / 2;
  const MAX_RADIUS_PX = 104;

  // Everything shares one metres-to-pixels scale, chosen so the widest
  // feature (fence, or the far edge of the error circle) fits with a
  // little headroom.
  const widestMetres = Math.max(
    punch.geoFenceRadius,
    punch.distanceFromCentre + punch.gpsAccuracy
  );
  const scale = MAX_RADIUS_PX / (widestMetres * 1.12);

  const fenceR = punch.geoFenceRadius * scale;
  const errorR = punch.gpsAccuracy * scale;
  // Offset along a diagonal purely so the two circles don't sit
  // concentric and unreadable when the distance is small.
  const angle = -Math.PI / 5;
  const punchX = cx + Math.cos(angle) * punch.distanceFromCentre * scale;
  const punchY = cy + Math.sin(angle) * punch.distanceFromCentre * scale;

  const errorEscapesFence =
    punch.distanceFromCentre + punch.gpsAccuracy > punch.geoFenceRadius;

  return (
    <div>
      <div className="rounded-lg border border-neutral/20 bg-background overflow-hidden">
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full">
          <defs>
            <pattern
              id="geo-grid"
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 32 0 L 0 0 0 32"
                fill="none"
                strokeWidth="1"
                className="stroke-neutral/15"
              />
            </pattern>
          </defs>
          <rect width={VIEW_W} height={VIEW_H} fill="url(#geo-grid)" />

          {/* Geo-fence */}
          <circle
            cx={cx}
            cy={cy}
            r={fenceR}
            strokeWidth={2}
            className="fill-primary/10 stroke-primary"
          />
          <circle cx={cx} cy={cy} r={3} className="fill-primary" />

          {/* GPS error margin */}
          <circle
            cx={punchX}
            cy={punchY}
            r={errorR}
            strokeWidth={2}
            strokeDasharray="6 5"
            className={
              errorEscapesFence
                ? "fill-warning/10 stroke-warning"
                : "fill-success/10 stroke-success"
            }
          />

          {/* Recorded position */}
          <circle
            cx={punchX}
            cy={punchY}
            r={7}
            strokeWidth={3}
            className={
              errorEscapesFence
                ? "fill-warning stroke-surface"
                : "fill-success stroke-surface"
            }
          />
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-2.5">
        <LegendSwatch className="border-primary bg-primary/10" >
          Geo-fence · {punch.geoFenceRadius} m radius
        </LegendSwatch>
        <LegendSwatch
          className={
            errorEscapesFence
              ? "border-warning bg-warning/10 border-dashed"
              : "border-success bg-success/10 border-dashed"
          }
        >
          GPS error · ±{punch.gpsAccuracy} m
        </LegendSwatch>
        <span className="text-[12px] text-neutral">
          Recorded {punch.distanceFromCentre} m from centre
        </span>
      </div>

      {errorEscapesFence && (
        <p className="text-[12px] text-warning mt-1.5">
          The error margin extends past the fence — the punch may have been
          taken outside {punch.locationName}.
        </p>
      )}
    </div>
  );
}

function LegendSwatch({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-[12px] text-neutral">
      <span className={`h-3 w-3 rounded-full border-2 ${className}`} />
      {children}
    </span>
  );
}
