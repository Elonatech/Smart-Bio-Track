"use client";

import { useEffect, useState } from "react";
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
import { distanceInMeters, formatDistance, describeGeolocationError } from "@/lib/geo";
import { useToast } from "@/app/components/Toast";

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
  "Server timestamp & replay protection",
];

type LocationState =
  | { status: "checking" }
  | { status: "denied"; message: string }
  | { status: "no-offices" }
  | { status: "resolved"; result: NearestOfficeResult };

function findNearestOffice(
  offices: Office[],
  point: { latitude: number; longitude: number },
  accuracyMeters: number
): NearestOfficeResult {
  const withDistance = offices.map((office) => ({
    office,
    distanceMeters: distanceInMeters(point, office),
  }));
  const nearest = withDistance.reduce((closest, candidate) =>
    candidate.distanceMeters < closest.distanceMeters ? candidate : closest
  );
  return {
    ...nearest,
    withinFence: nearest.distanceMeters <= nearest.office.geofenceRadiusMeters,
    accuracyMeters,
  };
}


interface ClockInFlowProps {
  onClose: () => void;
  onConfirmed: () => void;
}

export function ClockInFlow({ onClose, onConfirmed }: ClockInFlowProps) {
  const toast = useToast();
  const [location, setLocation] = useState<LocationState>({ status: "checking" });
  const [isConfirming, setIsConfirming] = useState(false);

  function runLocationCheck() {
    setLocation({ status: "checking" });

    if (!navigator.geolocation) {
      setLocation({
        status: "denied",
        message: "This browser does not support location access.",
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        appClient
          .get<Office[]>("/offices")
          .then((res) => {
            if (res.data.length === 0) {
              setLocation({ status: "no-offices" });
              return;
            }
            const result = findNearestOffice(
              res.data,
              { latitude: position.coords.latitude, longitude: position.coords.longitude },
              position.coords.accuracy
            );
            setLocation({ status: "resolved", result });
          })
          .catch(() => {
            setLocation({
              status: "denied",
              message: "Could not load your organization's offices. Try again.",
            });
          });
      },
      (error) => {
        setLocation({ status: "denied", message: describeGeolocationError(error) });
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }

  useEffect(() => {
    runLocationCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isWithinFence = location.status === "resolved" && location.result.withinFence;

  // Disables the final button for whichever reason is actually true right
  // now, and says so specifically — "you're 340m away" is a real,
  // actionable gate that the button stays disabled for. Once location is
  // genuinely fine, there is nothing left to block on: null here means
  // "enabled", with a permanent disclaimer below (not a disabled reason)
  // making clear the confirmation itself is still local-only.
  const confirmDisabledReason = (() => {
    if (location.status === "checking") return "Checking your location…";
    if (location.status === "denied") return "Resolve the location error above first.";
    if (location.status === "no-offices")
      return "No offices are configured for your organization yet.";
    if (!isWithinFence) return "You need to be inside an office's geo-fence to clock in.";
    return null;
  })();

  // Completes LOCALLY only — no Attendance/Punch model or endpoint exists
  // to actually record this against (project_smartbiotrack_known_gaps).
  // The short delay is deliberate: an instant flip reads as the button
  // doing nothing, the same trap the old fully-disabled version fell
  // into; a beat of "Confirming…" reads as a real check completing.
  async function handleConfirm() {
    setIsConfirming(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    toast.success(
      "Clocked in successfully",
      "Saved to this screen only — there is no backend endpoint yet to record a real attendance punch."
    );
    onConfirmed();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/40 p-0 sm:p-4">
      {/* A bottom sheet on phones — where this is actually meant to be
          used — and a centered modal from sm up. Full-width and anchored
          to the bottom is the one-handed-reachable shape on a phone;
          centering the same panel there would put the close button and
          the confirm action at opposite, both-thumbs-required corners. */}
      <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-surface border border-neutral/20 p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-semibold text-heading">Clock in</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-neutral hover:text-heading"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
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
                  : location.status === "resolved" || location.status === "denied"
                    ? "bg-alert/10 text-alert"
                    : "bg-primary/10 text-primary"
              }`}
            >
              {location.status === "checking" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} />
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
                <p className="text-xs text-neutral mt-0.5">Getting your location…</p>
              )}
              {location.status === "denied" && (
                <>
                  <p className="text-xs text-alert mt-0.5">{location.message}</p>
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
                  No offices are configured for your organization yet.
                </p>
              )}
              {location.status === "resolved" && (
                <>
                  <p
                    className={`text-xs mt-0.5 ${isWithinFence ? "text-success" : "text-alert"}`}
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
              <p className="text-sm font-medium text-heading">Other trust signals</p>
              <p className="text-xs text-neutral mt-0.5">
                {PENDING_TRUST_SIGNALS.join(" · ")} — pending backend support,
                not yet checked.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={confirmDisabledReason !== null || isConfirming}
          title={confirmDisabledReason ?? undefined}
          className="mt-5 w-full inline-flex items-center justify-center gap-2 bg-primary text-white text-sm font-semibold py-3 rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LogIn className="h-4 w-4" strokeWidth={2} />
          {isConfirming ? "Confirming…" : "Confirm clock-in"}
        </button>
        <p className="mt-2 text-center text-xs text-neutral">
          {confirmDisabledReason ??
            "This saves to your screen only — no backend endpoint exists yet to record a real punch."}
        </p>
      </div>
    </div>
  );
}
