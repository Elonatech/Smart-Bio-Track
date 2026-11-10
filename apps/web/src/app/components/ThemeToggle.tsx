"use client";

import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";

// Reads/writes the SAME 'theme' key the blocking script in layout.tsx
// already checked before first paint — this component just needs to
// reflect and toggle that existing state, not decide it from scratch.
//
// The "dark" class on <html> is the truth, so the button reads it directly
// (useSyncExternalStore) and watches it for changes, rather than copying it
// into state after the first render. On the server it reads as light.
function watchThemeClass(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
const readIsDark = () => document.documentElement.classList.contains("dark");
const serverIsDark = () => false;

export function ThemeToggle() {
  const isDark = useSyncExternalStore(watchThemeClass, readIsDark, serverIsDark);

  function toggle() {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="rounded-md p-2 text-neutral hover:bg-neutral/10 transition-colors"
    >
      {isDark ? (
        <Moon className="h-5 w-5" strokeWidth={1.75} />
      ) : (
        <Sun className="h-5 w-5" strokeWidth={1.75} />
      )}
    </button>
  );
}
