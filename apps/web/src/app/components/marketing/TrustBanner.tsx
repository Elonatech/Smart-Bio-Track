const POINTS = [
  "No raw biometric images ever touch our servers — verification happens at the device/OS level.",
  "Every attendance action is an immutable Punch Event; audit records cannot be altered or deleted.",
  "NDPA-aligned: data minimisation, in-country processing options, and documented retention policies.",
  "Replay protection with server-issued nonces and clock-drift detection on every punch.",
];

export function TrustBanner() {
  return (
    <section id="trust" className="bg-primary py-20 text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 sm:px-10 lg:px-16 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
            Trust & Security
          </p>
          <h2 className="mt-2 text-3xl font-semibold">
            No single signal ever approves attendance
          </h2>
          <p className="mt-4 max-w-md text-white/80">
            The Trust Score Engine weighs authentication, platform biometrics,
            registered device, device attestation, geo-fence validation,
            office network, GPS accuracy, and server timestamp integrity. A
            single compromised signal cannot approve a punch — and every
            decision is reproducible.
          </p>
        </div>

        <div className="grid gap-3">
          {POINTS.map((point) => (
            <div
              key={point}
              className="flex items-start gap-3 rounded-lg bg-white/10 px-4 py-3"
            >
              <span className="mt-0.5 text-white">✓</span>
              <span className="text-sm text-white/90">{point}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
