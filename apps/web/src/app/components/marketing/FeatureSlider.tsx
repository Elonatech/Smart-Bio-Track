"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Slide {
  title: string;
  description: string;
  image: string;
}

// Placeholder photography (picsum.photos, seeded so each slide stays
// consistent across reloads) — swap these for real photography of
// staff clocking in on their own phones before this ever ships. The
// seed keywords are just for a vaguely relevant, stable placeholder;
// they don't guarantee the actual photo content matches the caption.
const SLIDES: Slide[] = [
  {
    title: "Biometric Verification",
    description:
      "Employees confirm it's really them with Face ID or a fingerprint — right on their own phone, in under a second.",
    image: "https://picsum.photos/seed/smartbiotrack-biometric/1200/800",
  },
  {
    title: "Geo-Fenced Check-In",
    description:
      "A clock-in only counts when someone is physically inside the approved office radius — no clocking in from home for a colleague.",
    image: "https://picsum.photos/seed/smartbiotrack-geofence/1200/800",
  },
  {
    title: "Trust Score Engine",
    description:
      "Eight independent signals combine into a single score out of 100. No single signal — not even biometrics alone — can approve a punch by itself.",
    image: "https://picsum.photos/seed/smartbiotrack-trustscore/1200/800",
  },
  {
    title: "Payroll-Ready Reports",
    description:
      "Verified attendance exports straight into payroll — working days, lateness, and overtime, no manual reconciliation.",
    image: "https://picsum.photos/seed/smartbiotrack-payroll/1200/800",
  },
];

const AUTOPLAY_INTERVAL_MS = 6000;

export function FeatureSlider() {
  const [index, setIndex] = useState(0);

  // Auto-advance, but re-set the timer whenever `index` changes —
  // including when the user manually navigates — so a manual click
  // doesn't get immediately overridden by a stale timer.
  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % SLIDES.length);
    }, AUTOPLAY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [index]);

  function goTo(next: number) {
    setIndex((next + SLIDES.length) % SLIDES.length);
  }

  const slide = SLIDES[index];

  return (
    <section className="relative overflow-hidden">
      <div className="relative h-[420px] w-full sm:h-[500px] lg:h-[560px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- external placeholder URLs, not worth Next/Image config for throwaway placeholder photography */}
        <img
          key={slide.image}
          src={slide.image}
          alt={slide.title}
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Gradient so the text card stays readable regardless of the
            underlying photo's brightness. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        <div className="relative mx-auto flex h-full max-w-7xl items-end px-6 pb-16">
          <div className="max-w-lg text-white">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
              Core feature {index + 1} of {SLIDES.length}
            </span>
            <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
              {slide.title}
            </h2>
            <p className="mt-3 text-white/85">{slide.description}</p>
          </div>
        </div>

        {/* Prev / next arrows */}
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          aria-label="Previous feature"
          className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/20 p-2 text-white backdrop-blur hover:bg-white/30 transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          aria-label="Next feature"
          className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/20 p-2 text-white backdrop-blur hover:bg-white/30 transition-colors"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        {/* Dot indicators */}
        <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2">
          {SLIDES.map((s, i) => (
            <button
              key={s.title}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-6 bg-white" : "w-1.5 bg-white/40"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
