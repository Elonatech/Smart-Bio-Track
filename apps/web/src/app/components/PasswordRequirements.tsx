"use client";

import { Check, X } from "lucide-react";
import { checkPassword } from "@/lib/password-rules";

interface PasswordRequirementsProps {
  /** The current value of the password field. */
  password: string;
  /** Lets the input point at this list with aria-describedby. */
  id?: string;
}

// A live checklist under a "choose a password" field, so people know the
// rules BEFORE they hit submit and get a generic "must be 8+ characters and
// include..." error. Each line ticks green as it is satisfied.
//
// Only for fields where someone is CREATING a password. Never on sign-in:
// listing the rules there would tell an attacker what a valid password looks
// like, and a returning user has nothing to learn from it.
export function PasswordRequirements({
  password,
  id,
}: PasswordRequirementsProps) {
  // Nothing until they start typing. Five grey crosses under an empty box is
  // noise on a form that is otherwise short, and the rules read better the
  // moment they start to be satisfied than as a wall of "not yet" up front.
  if (password === "") return null;

  return (
    <ul id={id} className="mt-2 space-y-1 text-xs">
      {checkPassword(password).map(({ rule, met }) => (
        <li
          key={rule.id}
          className={`flex items-center gap-2 ${
            met ? "text-success" : "text-neutral"
          }`}
        >
          {met ? (
            <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />
          ) : (
            <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
          )}
          {/* The tick and cross are decorative; this is what a screen reader
              hears, so the state isn't carried by colour and shape alone. */}
          <span className="sr-only">{met ? "Met: " : "Not met: "}</span>
          {rule.label}
        </li>
      ))}
    </ul>
  );
}
