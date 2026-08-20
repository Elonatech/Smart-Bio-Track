"use client";

import { useState } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";
import type { UseFormRegisterReturn } from "react-hook-form";

interface PasswordInputProps {
  id: string;
  // Pass register("fieldName") straight through from the parent form —
  // this component doesn't know or care which field it's wired to.
  registration: UseFormRegisterReturn;
}

// Shared show/hide password field for every auth form. Built once here
// instead of copy-pasted per field (login's password, register's
// password AND confirmPassword) so the toggle behavior — and any
// future tweak to it — only needs to exist in one place.
export function PasswordInput({ id, registration }: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative">
      <Lock
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral"
        strokeWidth={1.75}
      />
      <input
        id={id}
        type={isVisible ? "text" : "password"}
        {...registration}
        // pr-9 (not the usual pr-3) leaves room on the right for the
        // eye button below, so typed text never runs under it.
        className="w-full rounded-md border border-neutral/40 pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <button
        type="button"
        onClick={() => setIsVisible((v) => !v)}
        aria-label={isVisible ? "Hide password" : "Show password"}
        // type="button" is important here — inside a <form>, a plain
        // <button> defaults to type="submit" and would submit the
        // form every time someone just wanted to peek at their password.
        className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral hover:text-heading"
      >
        {isVisible ? (
          <EyeOff className="h-4 w-4" strokeWidth={1.75} />
        ) : (
          <Eye className="h-4 w-4" strokeWidth={1.75} />
        )}
      </button>
    </div>
  );
}
