"use client";

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

// A row of cards that swipes sideways (with snap) on small screens and turns
// back into the normal grid above a breakpoint. Dots underneath show how many
// cards there are and which one is in view; tapping a dot scrolls to it.
//
// Cards are narrower than the screen so the next one peeks in — together
// with the dots, that's what tells people there's more to swipe.
//
// Tailwind only ships classes it can find written out in full, so each
// breakpoint's class set is spelled out below rather than built from `until`.
const LAYOUT = {
  // Swipes on phones only; grid from `sm` up.
  sm: {
    row: "-mx-6 px-6 scroll-px-6 sm:mx-0 sm:px-0 sm:grid sm:snap-none sm:overflow-visible sm:pb-0",
    item: "w-[80%] sm:w-auto",
    dots: "sm:hidden",
  },
  // Swipes on phones and tablets; grid from `lg` up. The bleed matches the
  // section's px-6 sm:px-10 padding so the row reaches the screen edge.
  lg: {
    row: "-mx-6 px-6 scroll-px-6 sm:-mx-10 sm:px-10 sm:scroll-px-10 lg:mx-0 lg:px-0 lg:grid lg:snap-none lg:overflow-visible lg:pb-0",
    item: "w-[85%] sm:w-[60%] lg:w-auto",
    dots: "lg:hidden",
  },
} as const;

interface SwipeRowProps {
  /** Read out for the scrollable region, e.g. "Customer testimonials". */
  label: string;
  /** Breakpoint at which the row becomes a grid. */
  until?: keyof typeof LAYOUT;
  /** Grid columns/gaps for the wide layout, e.g. "sm:grid-cols-2 lg:grid-cols-3 sm:gap-5". */
  gridClassName: string;
  children: ReactNode;
}

export function SwipeRow({ label, until = "sm", gridClassName, children }: SwipeRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const items = Children.toArray(children);
  const layout = LAYOUT[until];

  // Whichever card's left edge is closest to the row's scroll position is
  // the one "in view". Recomputed on scroll, so swiping moves the dots too.
  const updateActive = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    // At the very end, the last card can't reach the left edge (the row
    // runs out first), so "closest left edge" would never pick it.
    if (row.scrollLeft >= row.scrollWidth - row.clientWidth - 2) {
      setActive(row.children.length - 1);
      return;
    }
    const padding = parseFloat(getComputedStyle(row).paddingLeft) || 0;
    let closest = 0;
    let closestDistance = Infinity;
    Array.from(row.children).forEach((child, index) => {
      const distance = Math.abs((child as HTMLElement).offsetLeft - padding - row.scrollLeft);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = index;
      }
    });
    setActive(closest);
  }, []);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    row.addEventListener("scroll", updateActive, { passive: true });
    return () => row.removeEventListener("scroll", updateActive);
  }, [updateActive]);

  function goTo(index: number) {
    const row = rowRef.current;
    const card = row?.children[index] as HTMLElement | undefined;
    if (!row || !card) return;
    const padding = parseFloat(getComputedStyle(row).paddingLeft) || 0;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Clamped: the last cards' left edges sit past the furthest the row can
    // scroll, and an out-of-range smooth scroll can be dropped entirely.
    const maxScroll = row.scrollWidth - row.clientWidth;
    const left = Math.min(card.offsetLeft - padding, maxScroll);
    row.scrollTo({ left, behavior: reduceMotion ? "auto" : "smooth" });
    // Light the tapped dot now rather than when the smooth scroll lands —
    // the scroll handler will agree once it does.
    setActive(index);
  }

  return (
    <div className="mt-10">
      {/* `relative` makes offsetLeft measure from the row itself.
          tabIndex + label let keyboard users focus it and scroll with arrows. */}
      <div
        ref={rowRef}
        tabIndex={0}
        aria-label={label}
        className={`relative flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${layout.row} ${gridClassName}`}
      >
        {items.map((item, index) => (
          <div key={index} className={`shrink-0 snap-start ${layout.item}`}>
            {item}
          </div>
        ))}
      </div>

      <div className={`mt-3 flex justify-center ${layout.dots}`}>
        {items.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => goTo(index)}
            aria-label={`Show card ${index + 1} of ${items.length}`}
            aria-current={index === active ? "true" : undefined}
            // The padding is the tap target; the visible dot is the span.
            // px-1 keeps the dots ~8px apart; py-2 keeps the target tall.
            className="px-1 py-2"
          >
            <span
              className={`block h-2 rounded-full transition-all ${
                index === active ? "w-5 bg-primary" : "w-2 bg-neutral/30"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
