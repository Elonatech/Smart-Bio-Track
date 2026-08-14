"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

// Reads/writes the SAME 'theme' key the blocking script in layout.tsx
// already checked before first paint — this component just needs to
// reflect and toggle that existing state, not decide it from scratch.
export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
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
        <Sun className="h-4 w-4" strokeWidth={1.75} />
      ) : (
        <Moon className="h-4 w-4" strokeWidth={1.75} />
      )}
    </button>
  );
}
