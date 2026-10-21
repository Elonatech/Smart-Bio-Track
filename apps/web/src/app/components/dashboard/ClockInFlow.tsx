"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  MapPin,
  Fingerprint,
  LogIn,
  CircleCheck,
  CircleX,
  LoaderCircle,
  ShieldQuestion,
} from "lucide-react";
import { appClient } from "@/lib/api-client";
import { punchErrorMessage, type PunchLocation } from "@/lib/attendance";
import {
  distanceInMeters,
  formatDistance,
  describeGeolocationError,
} from "@/lib/geo";
import { useToast } from "@/app/components/Toast";
import { ClockInResult } from "@/app/components/dashboard/ClockInResult";
import {
  submitClockIn,
  type ClockInOutcome,
  type RecordedClockIn,
} from "@/app/components/dashboard/clockInOutcome";

interface Office {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
}

interface NearestOfficeResult {
  office: Office;
  distanceMeters: number;
  withinFence: boolean;
  /** GPS's own reported precision, metres — the browser already returns
   * this on every position read; nothing extra to fetch or compute. */
  accuracyMeters: number;
}

const PENDING_TRUST_SIGNALS = [
  "User authentication (MFA)",
  "Registered device",
  "Device attestation",
  "Office network validation",
  "Replay protection",
];

type LocationState =
  | { status: "checking" }
  | { status: "denied"; message: string }
  | { status: "no-offices" }
  | { status: "resolved"; result: NearestOfficeResult };

function findNearestOffice(
  offices: Office[],
  point: { latitude: number; longitude: number },
  accuracyMeters: number,
): NearestOfficeResult {
  const withDistance = offices.map((office) => ({
    office,
    distanceMeters: distanceInMeters(point, office),
  }));
  const nearest = withDistance.reduce((closest, candidate) =>
    candidate.distanceMeters < closest.distanceMeters ? candidate : closest,
  );
  return {
    ...nearest,
    withinFence: nearest.distanceMeters <= nearest.office.geofenceRadiusMeters,
    accuracyMeters,
  };
}

interface ClockInFlowProps {
  onClose: () => void;
  /** Called for approved and flagged outcomes — both are recorded punches.
   * Not called for rejected, which records nothing. */
  onConfirmed: (outcome: RecordedClockIn) => void;
  /**
   * Called when the clock-in fails. The server may have refused because the
   * screen was out of date (another tab already clocked in), so the parent
   * re-reads the real state.
   */
  onFailed?: () => void;
}

export function ClockInFlow({ onClose, onConfirmed, onFailed }: ClockInFlowProps) {
  const toast = useToast();
  // A browser with no geolocation at all is known before the first render,
  // so it's the initial state rather than something an effect discovers.
  const [location, setLocation] = useState<LocationState>(() =>
    typeof navigator !== "undefined" && navigator.geolocation
      ? { status: "checking" }
      : { status: "denied", message: "This browser does not support location access." }
  );
  const [isConfirming, setIsConfirming] = useState(false);
  const [result, setResult] = useState<ClockInOutcome | null>(null);
  // Sent with the punch for the audit trail. A ref, not state: nothing
  // renders from it.
  const positionRef = useRef<PunchLocation | null>(null);

  // Asks the browser for a position and judges it against the branches.
  // Every state change here happens in a callback, once the browser or the
  // server answers — which is what lets the mount effect below call it.
  function readLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        positionRef.current = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        };
        appClient
          .get<Office[]>("/offices")
          .then((res) => {
            if (res.data.length === 0) {
              setLocation({ status: "no-offices" });
              return;
            }
            const result = findNearestOffice(
              res.data,
              {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              },
              position.coords.accuracy,
            );
            setLocation({ status: "resolved", result });
          })
          .catch(() => {
            setLocation({
              status: "denied",
              message: "Could not load your organization's branches. Try again.",
            });
          });
      },
      (error) => {
        setLocation({
          status: "denied",
          message: describeGeolocationError(error),
        });
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  /** "Check again" / retry: show the checking state, then read again. */
  function runLocationCheck() {
    setLocation({ status: "checking" });
    readLocation();
  }

  // Mount only. The initial state is already "checking", so there's nothing
  // to set before reading — setting state synchronously in an effect is what
  // the React lint rule flags (an extra render for nothing).
  useEffect(() => {
    readLocation();
  }, []);

  const isWithinFence =
    location.status === "resolved" && location.result.withinFence;

  // A HINT, not a gate (Phase 3 Manual, decision 6): location is recorded
  // with the punch, never enforced, until Phase 4 makes the server the
  // authority. So the button only waits while the location check is still
  // running; outside the fence, with location blocked, or with no branches
  // set up, the person can still clock in — and is told plainly what was
  // found. (This used to disable the button in all three cases.)
  const isCheckingLocation = location.status === "checking";
  const locationWarning = (() => {
    if (location.status === "denied")
      return "We couldn't read your location, so your clock-in will be recorded without one.";
    if (location.status === "no-offices")
      return "No branches are set up yet, so we can't check where you are.";
    if (location.status === "resolved" && !isWithinFence)
      return `You appear to be outside ${location.result.office.name}'s geo-fence. You can still clock in — your location is recorded with it.`;
    return null;
  })();

  // Records a real punch via POST /attendance/clock-in (submitClockIn). The
  // result screen handles all three Trust Score outcomes; Phase 3 can only
  // return approved.
  async function handleConfirm() {
    setIsConfirming(true);
    try {
      const outcome = await submitClockIn(positionRef.current);
      if (outcome.status !== "rejected") onConfirmed(outcome);
      setResult(outcome);
    } catch (error) {
      // A failed request is not a "rejected" outcome — nothing was decided.
      // Stay on the checks so they can tap confirm again. The server's
      // refusals ("You are already clocked in.") are written for people, so
      // they're shown as-is.
      toast.error("Couldn't clock you in", punchErrorMessage(error));
      onFailed?.();
    } finally {
      setIsConfirming(false);
    }
  }

  function handleRetry() {
    setResult(null);
    runLocationCheck();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/40 p-0 sm:p-4">
      {/* A bottom sheet on phones — where this is actually meant to be
          used — and a centered modal from sm up. Full-width and anchored
          to the bottom is the one-handed-reachable shape on a phone;
          centering the same panel there would put the close button and
          the confirm action at opposite, both-thumbs-required corners. */}
      <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-surface border border-neutral/20 p-6 max-h-[85dvh] overflow-y-auto">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-semibold text-heading">Clock in</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-3 -mt-3 p-3 text-neutral hover:text-heading"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {result ? (
          <div className="mt-4">
            <ClockInResult
              outcome={result}
              onDone={onClose}
              onRetry={handleRetry}
            />
          </div>
        ) : (
          <>
            <p className="text-sm text-neutral mb-5">
              Verifying your location before you clock in.
            </p>

            <div className="space-y-3">
              {/* Step 1 — Location. The one step that is genuinely live: a
              real GPS read compared against real office coordinates. */}
              <div className="flex items-start gap-3 rounded-lg border border-neutral/20 p-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    location.status === "resolved" && isWithinFence
                      ? "bg-success/10 text-success"
                      : location.status === "resolved" ||
                          location.status === "denied"
                        ? "bg-alert/10 text-alert"
                        : "bg-primary/10 text-primary"
                  }`}
                >
                  {location.status === "checking" ? (
                    <LoaderCircle
                      className="h-4 w-4 animate-spin"
                      strokeWidth={2}
                    />
                  ) : location.status === "resolved" && isWithinFence ? (
                    <CircleCheck className="h-4 w-4" strokeWidth={2} />
                  ) : location.status === "resolved" ? (
                    <CircleX className="h-4 w-4" strokeWidth={2} />
                  ) : location.status === "denied" ? (
                    <CircleX className="h-4 w-4" strokeWidth={2} />
                  ) : (
                    <MapPin className="h-4 w-4" strokeWidth={2} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-heading">Location</p>
                  {location.status === "checking" && (
                    <p className="text-xs text-neutral mt-0.5">
                      Getting your location…
                    </p>
                  )}
                  {location.status === "denied" && (
                    <>
                      <p className="text-xs text-alert mt-0.5">
                        {location.message}
                      </p>
                      <button
                        type="button"
                        onClick={runLocationCheck}
                        className="mt-2 text-xs font-medium text-primary hover:underline"
                      >
                        Try again
                      </button>
                    </>
                  )}
                  {location.status === "no-offices" && (
                    <p className="text-xs text-alert mt-0.5">
                      No branches are configured for your organization yet.
                    </p>
                  )}
                  {location.status === "resolved" && (
                    <>
                      <p
                        className={`text-xs mt-0.5 ${isWithinFence ? "text-success" : "text-warning"}`}
                      >
                        {isWithinFence
                          ? `Within ${location.result.office.name}'s geo-fence (±${Math.round(location.result.accuracyMeters)} m GPS accuracy)`
                          : `${formatDistance(location.result.distanceMeters)} from ${location.result.office.name} — outside its ${location.result.office.geofenceRadiusMeters} m geo-fence`}
                      </p>
                      {!isWithinFence && (
                        <button
                          type="button"
                          onClick={runLocationCheck}
                          className="mt-2 text-xs font-medium text-primary hover:underline"
                        >
                          Check again
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Step 2 — Identity. Deliberately shown as pending rather than
              attempted: calling navigator.credentials.get() with no
              credential ever registered for this account would not fail
              gracefully — it surfaces the browser's own native "no
              passkey available" prompt, which reads as the app being
              broken rather than a feature that is not built yet. */}
              <div className="flex items-start gap-3 rounded-lg border border-neutral/20 p-3 opacity-60">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral/10 text-neutral">
                  <Fingerprint className="h-4 w-4" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-heading">Identity</p>
                  <p className="text-xs text-neutral mt-0.5">
                    Face ID / fingerprint confirmation — not available yet, no
                    backend support for device registration exists.
                  </p>
                </div>
              </div>

              {/* Everything else the finished Trust Score Engine will weigh
              (TrustBanner.tsx on the marketing page). Listed so the full
              picture is visible now rather than only once every signal is
              real — but there is no checkmark on any of them, because none
              of them actually ran. A "96/100, all signals passed" summary
              would be presenting fabricated verification results as real
              ones, which is a materially worse thing to get wrong on a
              compliance-positioned attendance product than an unfinished
              feature — see the note above this component. */}
              <div className="flex items-start gap-3 rounded-lg border border-dashed border-neutral/20 p-3 opacity-60">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral/10 text-neutral">
                  <ShieldQuestion className="h-4 w-4" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-heading">
                    Other trust signals
                  </p>
                  <p className="text-xs text-neutral mt-0.5">
                    {PENDING_TRUST_SIGNALS.join(" · ")} — pending backend
                    support, not yet checked.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={isCheckingLocation || isConfirming}
              title={isCheckingLocation ? "Checking your location…" : undefined}
              className="mt-5 w-full inline-flex items-center justify-center gap-2 bg-primary text-white text-sm font-semibold py-3 rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LogIn className="h-4 w-4" strokeWidth={2} />
              {isConfirming
                ? "Confirming…"
                : isCheckingLocation
                  ? "Checking your location…"
                  : "Confirm clock-in"}
            </button>
            {locationWarning ? (
              <p role="status" className="mt-2 rounded-md bg-warning/10 px-3 py-2 text-center text-xs text-warning">
                {locationWarning}
              </p>
            ) : (
              <p className="mt-2 text-center text-xs text-neutral">
                Your clock-in is recorded with the server&apos;s time, along with your location.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
