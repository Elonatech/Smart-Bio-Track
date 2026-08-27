"use client";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string; // used for aria-label — every toggle needs one, none here have visible <label> elements of their own
}

// A plain checkbox styled to look like a switch — no external toggle
// library needed for something this simple. `sr-only` hides the real
// checkbox visually while keeping it in the accessibility tree (screen
// readers, keyboard focus/Space-to-toggle all still work normally).
export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="sr-only peer"
      />
      <div className="w-11 h-6 rounded-full bg-neutral/30 peer-checked:bg-primary transition-colors" />
      <div className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
    </label>
  );
}
