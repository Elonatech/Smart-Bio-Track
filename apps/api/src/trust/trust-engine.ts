import { LocationPolicy, PunchType, TrustDecision } from '@prisma/client';

/**
 * The Trust Score Engine (PRTS Module 3; Phase 4 plan §5) — pure, so every
 * rule here is tested without a database, a phone or a network.
 *
 * Each signal answers one question and returns PASS, WEAK or FAIL with a
 * reason a person can read. The outcome then follows from fixed rules, not
 * from a weighted formula (D8): "rejected because you were 2 km from every
 * office and not on an office network" is something an employee can dispute
 * and HR can check; "your score was 41" is not.
 *
 * The service gathers the facts (distances, network matches, the signature
 * check) and passes them in; nothing here does I/O.
 */

export type SignalName =
  | 'device'
  | 'replay'
  | 'integrity'
  | 'geofence'
  | 'network'
  | 'velocity'
  | 'web'
  | 'overtimeOffsite';

/**
 * NOT_CHECKED is recorded and never changes the outcome. It exists for checks
 * that aren't built yet — app integrity needs the paid Apple and Google
 * accounts — so the evidence says plainly "this wasn't checked" rather than
 * pretending it passed, without flagging every punch until then.
 */
export type SignalResult = 'PASS' | 'WEAK' | 'FAIL' | 'NOT_CHECKED';

export interface Signal {
  signal: SignalName;
  result: SignalResult;
  reason: string;
}

export interface TrustSettings {
  locationPolicy: LocationPolicy;
  maxAccuracyMeters: number;
  fenceMarginMeters: number;
  maxSpeedKmh: number;
}

// ─── signals ────────────────────────────────────────────────────────────────

/** The phone's signature over the one-time code, by its registered key. */
export function deviceSignal(facts: {
  hasActiveDevice: boolean;
  signatureValid: boolean;
}): Signal {
  if (!facts.hasActiveDevice) {
    return fail('device', 'No registered phone for this account.');
  }
  return facts.signatureValid
    ? pass('device', 'Signed by your registered phone after biometric unlock.')
    : fail('device', 'The signature does not match your registered phone.');
}

/** The one-time code was fresh, unused, and issued to this person's phone. */
export function replaySignal(codeAccepted: boolean): Signal {
  return codeAccepted
    ? pass('replay', 'One-time code was fresh and unused.')
    : fail('replay', 'The one-time code is invalid, used or expired.');
}

/** App Attest / Play Integrity — not available until the paid accounts. */
export function integritySignal(): Signal {
  return {
    signal: 'integrity',
    result: 'NOT_CHECKED',
    reason: 'App integrity checks are not active yet.',
  };
}

/**
 * Inside an office's geo-fence?
 *
 * `nearest` is the closest office of the organisation (by PostGIS distance),
 * so someone visiting another branch is judged against that branch. Null when
 * the organisation has no offices.
 *
 *   inside the radius, good fix ................ PASS
 *   inside the radius, poor fix ................ WEAK (can't be sure)
 *   outside by no more than the margin ......... WEAK (edge of the fence)
 *   outside, but a poor fix could reach inside . WEAK (can't be sure)
 *   clearly outside ............................ FAIL
 *   no location, or nowhere to compare ......... FAIL
 */
export function geofenceSignal(
  facts: {
    accuracyMeters: number | null;
    nearest: {
      name: string;
      distanceMeters: number;
      radiusMeters: number;
    } | null;
  },
  settings: Pick<TrustSettings, 'maxAccuracyMeters' | 'fenceMarginMeters'>,
): Signal {
  const { nearest, accuracyMeters } = facts;
  if (!nearest) {
    return fail('geofence', 'No location was sent, or no office is set up.');
  }

  const d = Math.round(nearest.distanceMeters);
  const accuracy = accuracyMeters ?? Infinity;
  const goodFix = accuracy <= settings.maxAccuracyMeters;
  const where = `${d} m from ${nearest.name} (fence ${nearest.radiusMeters} m)`;

  if (nearest.distanceMeters <= nearest.radiusMeters) {
    return goodFix
      ? pass('geofence', `Inside the fence: ${where}.`)
      : weak(
          'geofence',
          `Inside the fence, but the location fix is poor (±${fmt(accuracy)}): ${where}.`,
        );
  }
  if (
    nearest.distanceMeters <=
    nearest.radiusMeters + settings.fenceMarginMeters
  ) {
    return weak('geofence', `Just outside the fence: ${where}.`);
  }
  if (!goodFix && nearest.distanceMeters - accuracy <= nearest.radiusMeters) {
    return weak(
      'geofence',
      `Probably outside, but the fix is too poor to be sure (±${fmt(accuracy)}): ${where}.`,
    );
  }
  return fail('geofence', `Outside the fence: ${where}.`);
}

/** On an approved office network? Null `matchedOffice` = no range matched. */
export function networkSignal(facts: {
  ipAddress: string | null;
  anyRangesConfigured: boolean;
  matchedOffice: string | null;
}): Signal {
  if (!facts.anyRangesConfigured) {
    return fail('network', 'No office network is set up.');
  }
  if (!facts.ipAddress) {
    return fail('network', 'Your network address could not be determined.');
  }
  return facts.matchedOffice
    ? pass('network', `On the ${facts.matchedOffice} office network.`)
    : fail('network', 'Not on an office network.');
}

/**
 * Impossible travel since the previous punch that had a location. Only ever
 * WEAK: a bad GPS fix on either punch produces the same numbers, so it's a
 * question for HR, never a refusal.
 */
export function velocitySignal(
  previous: { distanceMeters: number; secondsAgo: number } | null,
  settings: Pick<TrustSettings, 'maxSpeedKmh'>,
): Signal {
  if (!previous) {
    return pass('velocity', 'No earlier located punch to compare with.');
  }
  // Under a minute apart, a few metres of GPS jitter is "hundreds of km/h".
  const hours = Math.max(previous.secondsAgo, 60) / 3600;
  const kmh = previous.distanceMeters / 1000 / hours;
  return kmh > settings.maxSpeedKmh
    ? weak(
        'velocity',
        `Moved ${Math.round(previous.distanceMeters / 1000)} km since the last punch (~${Math.round(kmh)} km/h).`,
      )
    : pass('velocity', 'Movement since the last punch is plausible.');
}

/** D14: until the web has device registration, every web punch is reviewed. */
export function webSignal(): Signal {
  return weak(
    'web',
    "Recorded from the website, which can't verify the device. Web clock-ins are always reviewed.",
  );
}

/** D13: a clock-out away from the office that earns overtime is reviewed. */
export function overtimeOffsiteSignal(overtimeMinutes: number): Signal {
  return weak(
    'overtimeOffsite',
    `Clocked out away from the office with ${overtimeMinutes} min of overtime.`,
  );
}

// ─── the decision ───────────────────────────────────────────────────────────

export type TrustOutcome = TrustDecision | 'REJECTED';

export interface TrustVerdict {
  outcome: TrustOutcome;
  score: number;
  signals: Signal[];
}

/**
 * What the signals add up to (plan §5).
 *
 *  1. Identity (device, replay, integrity) failing rejects — a punch we can't
 *     attribute to the employee's own phone is not their punch.
 *  2. Location is judged on CLOCK_IN only (D13). Under EITHER, the geo-fence
 *     or the network passing is enough; under BOTH, both must. A weak
 *     geo-fence that can't be settled flags rather than rejects (D2).
 *  3. Anything else weak flags.
 *
 * Web punches are never rejected on location — the browser's position is too
 * rough to refuse someone on — and always flagged (D14). The service passes
 * `source: 'WEB'` and includes the web signal; the location signals are still
 * recorded for HR.
 */
export function decide(input: {
  type: PunchType;
  source: 'MOBILE' | 'WEB';
  policy: LocationPolicy;
  signals: Signal[];
}): TrustVerdict {
  const { signals } = input;
  const get = (name: SignalName) => signals.find((s) => s.signal === name);
  const score = scoreOf(signals);

  const identity = signals.filter((s) =>
    ['device', 'replay', 'integrity'].includes(s.signal),
  );
  if (identity.some((s) => s.result === 'FAIL')) {
    return { outcome: 'REJECTED', score, signals };
  }

  if (input.type === PunchType.CLOCK_IN && input.source === 'MOBILE') {
    const geo = get('geofence')?.result;
    const net = get('network')?.result;
    const located =
      input.policy === LocationPolicy.BOTH
        ? geo === 'PASS' && net === 'PASS'
        : geo === 'PASS' || net === 'PASS';
    const settleable =
      input.policy === LocationPolicy.BOTH
        ? geo === 'WEAK' && net === 'PASS'
        : geo === 'WEAK';

    if (!located && !settleable) {
      return { outcome: 'REJECTED', score, signals };
    }
    if (!located) {
      return { outcome: TrustDecision.FLAGGED, score, signals };
    }
  }

  // Location signals off clock-in are evidence only, so they don't flag.
  const judged = signals.filter(
    (s) =>
      input.type === PunchType.CLOCK_IN ||
      !['geofence', 'network', 'velocity'].includes(s.signal),
  );
  // Under EITHER a failed network beside a passing fence is not a concern,
  // and vice versa; only WEAK results flag.
  const flagged = judged.some((s) => s.result === 'WEAK');

  return {
    outcome: flagged ? TrustDecision.FLAGGED : TrustDecision.APPROVED,
    score,
    signals,
  };
}

/**
 * 0–100, for reporting only (D8): 100, minus 15 per weak signal and 40 per
 * failed one. The outcome never reads this.
 */
export function scoreOf(signals: Signal[]): number {
  const penalty = signals.reduce(
    (sum, s) => sum + (s.result === 'WEAK' ? 15 : s.result === 'FAIL' ? 40 : 0),
    0,
  );
  return Math.max(0, Math.min(100, 100 - penalty));
}

function pass(signal: SignalName, reason: string): Signal {
  return { signal, result: 'PASS', reason };
}
function weak(signal: SignalName, reason: string): Signal {
  return { signal, result: 'WEAK', reason };
}
function fail(signal: SignalName, reason: string): Signal {
  return { signal, result: 'FAIL', reason };
}
function fmt(m: number) {
  return Number.isFinite(m) ? `${Math.round(m)} m` : 'unknown';
}
