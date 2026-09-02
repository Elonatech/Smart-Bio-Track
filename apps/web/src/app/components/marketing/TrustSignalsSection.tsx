"use client";

import { useState } from "react";
import {
  Fingerprint,
  ScanFace,
  Smartphone,
  ShieldCheck,
  MapPin,
  Wifi,
  LocateFixed,
  Clock,
  type LucideIcon,
} from "lucide-react";

interface Signal {
  icon: LucideIcon;
  title: string;
  plain: string; // one-line, non-technical explanation
  example: string; // matches the wording style of the hero's Live Clock-in Evaluation widget
}

// Deliberately the SAME eight signals shown in the hero's Live
// Clock-in Evaluation widget — this section is meant to feel like a
// zoomed-in explanation of that widget, not a separate, disconnected
// feature list.
const SIGNALS: Signal[] = [
  {
    icon: Fingerprint,
    title: "User Authentication",
    plain: "Confirms it's really you signing in — session and password both checked.",
    example: "Session token valid · MFA satisfied",
  },
  {
    icon: ScanFace,
    title: "Platform Biometric Verification",
    plain: "Uses your phone or laptop's own Face ID / fingerprint sensor — we never see or store the biometric itself.",
    example: "Face ID matched at OS level",
  },
  {
    icon: Smartphone,
    title: "Registered Device",
    plain: "Only phones or laptops you've explicitly approved can be used to clock in.",
    example: "iPhone 14 · registered 12 Mar 2026",
  },
  {
    icon: ShieldCheck,
    title: "Device Attestation",
    plain: "Checks the device itself hasn't been tampered with, rooted, or jailbroken.",
    example: "App Attest passed · device not rooted",
  },
  {
    icon: MapPin,
    title: "Geo-Fence Validation",
    plain: "Confirms you're physically inside the office's approved boundary.",
    example: "Inside Lagos HQ fence (120m radius)",
  },
  {
    icon: Wifi,
    title: "Office Network Validation",
    plain: "Checks you're connected through an approved office network, not a random hotspot.",
    example: "Connected to ELONA-CORP gateway",
  },
  {
    icon: LocateFixed,
    title: "GPS Accuracy",
    plain: "A vague location isn't good enough — we check how precise the GPS reading actually is.",
    example: "±6m horizontal accuracy",
  },
  {
    icon: Clock,
    title: "Server Timestamp & Replay Protection",
    plain: "Every punch gets a unique, tamper-proof timestamp — an old clock-in can never be replayed.",
    example: "Nonce unique · clock drift 0.4s",
  },
];

export function TrustSignalsSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = SIGNALS[activeIndex];

  return (
    <section id="features" className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-16 py-20">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
        The Trust Score Engine
      </p>
      <h2 className="mt-2 text-3xl font-semibold text-heading">
        Every attendance event, verified eight ways
      </h2>
      <p className="mt-3 max-w-2xl text-neutral">
        These are the same eight checks shown in the live widget above. Each
        one adds to a score out of 100 — no single check can approve a punch
        on its own. Select any signal to see what it actually means.
      </p>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* Left: the 8 selectable signals, 2 columns on larger screens */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SIGNALS.map((signal, index) => {
            const Icon = signal.icon;
            const isActive = index === activeIndex;
            return (
              <button
                key={signal.title}
                type="button"
                onClick={() => setActiveIndex(index)}
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                  isActive
                    ? "border-primary bg-primary/5"
                    : "border-neutral/20 hover:border-primary/40"
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                    isActive ? "bg-primary text-white" : "bg-neutral/10 text-neutral"
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <span className="text-sm font-medium text-heading">
                  {signal.title}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right: detail panel for whichever signal is selected */}
        <div className="rounded-xl border border-neutral/20 bg-surface p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral">
            Signal {activeIndex + 1} of {SIGNALS.length}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-white">
              <active.icon className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <h3 className="text-lg font-semibold text-heading">
              {active.title}
            </h3>
          </div>
          <p className="mt-4 text-sm text-neutral">{active.plain}</p>

          <div className="mt-5 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
            Passing example: {active.example}
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between text-xs text-neutral">
              <span>Contribution to Trust Score</span>
              <span>{activeIndex + 1}/8 checked</span>
            </div>
            <div className="mt-2 flex gap-1">
              {SIGNALS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${
                    i <= activeIndex ? "bg-success" : "bg-neutral/20"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
