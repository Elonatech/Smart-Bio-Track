import type { FlaggedPunch } from "@/app/components/dashboard/PunchReviewModal";

// Example flagged punches, shared by HR's Review Queue (whole
// organization) and a Team Lead's Pending Exceptions (their department
// only, filtered below). UI only — there's no Attendance/Punch model in
// prisma/schema.prisma and no attendance module in apps/api/src.
//
// The two pages genuinely are the same queue at different scopes, which
// is why they read from one array rather than keeping separate copies. A
// real API would do the narrowing server-side from the caller's own
// department, not with a filter in the browser.
export const SAMPLE_FLAGGED_PUNCHES: FlaggedPunch[] = [
  {
    id: "1",
    reference: "PE-90412",
    employeeName: "Emeka Nwachukwu",
    timestamp: "10 Aug 2026, 09:12 WAT",
    department: "Field Operations",
    device: "iPhone 13",
    deviceRegistered: "22 Aug 2025",
    locationName: "Trans Amadi Industrial Layout, Port Harcourt",
    reason: "GPS accuracy below threshold (±184 m)",
    trustScore: 68,
    geoFenceRadius: 130,
    distanceFromCentre: 96,
    gpsAccuracy: 184,
    signals: [
      {
        label: "User Authentication",
        detail: "Session token valid · MFA satisfied",
        status: "PASS",
      },
      {
        label: "Platform Biometric Verification",
        detail: "Face ID matched at OS level",
        status: "PASS",
      },
      {
        label: "Registered Device",
        detail: "iPhone 13 · registered 22 Aug 2025",
        status: "PASS",
      },
      {
        label: "Device Attestation",
        detail: "App Attest passed · device not rooted",
        status: "PASS",
      },
      {
        label: "Geo-Fence Validation",
        detail: "Inside fence but within GPS error margin",
        status: "WARN",
      },
      {
        label: "Office Network Validation",
        detail: "Mobile data (MTN) — not on office gateway",
        status: "WARN",
      },
      {
        label: "GPS Accuracy",
        detail: "±184 m — above the 50 m threshold",
        status: "FAIL",
      },
      {
        label: "Server Timestamp & Replay Protection",
        detail: "Nonce unique · clock drift 0.4 s",
        status: "PASS",
      },
    ],
  },
  {
    id: "2",
    reference: "PE-90418",
    employeeName: "Tunde Alabi",
    timestamp: "10 Aug 2026, 09:31 WAT",
    department: "Engineering",
    device: "Samsung A54",
    deviceRegistered: "03 Mar 2026",
    locationName: "Lagos HQ — Victoria Island",
    reason: "Temporary network failure — offline synchronisation",
    trustScore: 74,
    geoFenceRadius: 130,
    distanceFromCentre: 18,
    gpsAccuracy: 12,
    signals: [
      {
        label: "User Authentication",
        detail: "Session token valid · MFA satisfied",
        status: "PASS",
      },
      {
        label: "Platform Biometric Verification",
        detail: "Fingerprint matched at OS level",
        status: "PASS",
      },
      {
        label: "Registered Device",
        detail: "Samsung A54 · registered 03 Mar 2026",
        status: "PASS",
      },
      {
        label: "Device Attestation",
        detail: "Play Integrity passed · device not rooted",
        status: "PASS",
      },
      {
        label: "GPS Accuracy",
        detail: "±12 m — within the 50 m threshold",
        status: "PASS",
      },
      {
        label: "Geo-Fence Validation",
        detail: "Lagos HQ · 18 m from centre",
        status: "PASS",
      },
      {
        label: "Offline Synchronisation",
        detail: "Punch reached the server 42 min after capture",
        status: "FAIL",
      },
      {
        label: "Office Network Validation",
        detail: "Offline at capture — no gateway seen",
        status: "WARN",
      },
      {
        label: "Server Timestamp & Replay Protection",
        detail: "Nonce unique · clock drift 1.8 s",
        status: "WARN",
      },
    ],
  },
];
