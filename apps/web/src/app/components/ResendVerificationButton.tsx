"use client";

import { useEffect, useState } from "react";
import { appClient, extractErrorMessage } from "@/lib/api-client";
import { useToast } from "@/app/components/Toast";

// "Didn't get it? Resend" for a signup still waiting on its verification
// email — POST /auth/resend-organization-verification.
//
// The endpoint answers identically whether or not the address has a pending
// signup (so it can't be used to find out who has signed up), which is why
// the success wording says "if", never "we found your signup".
//
// The cooldown is a courtesy, not the protection: the API throttles this
// route itself. It stops an impatient double-click sending three emails and
// tripping that limit.

const COOLDOWN_SECONDS = 60;

interface ResendVerificationButtonProps {
  email: string;
  /** Text before the button. The expired-link screen asks differently. */
  prompt?: string;
  /** For screens where the person types the email first. */
  disabled?: boolean;
}

export function ResendVerificationButton({
  email,
  prompt = "Didn't get it?",
  disabled = false,
}: ResendVerificationButtonProps) {
  const toast = useToast();
  const [isSending, setIsSending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  async function handleResend() {
    setError(null);
    setIsSending(true);
    try {
      await appClient.post("/auth/resend-organization-verification", { email });
      setSecondsLeft(COOLDOWN_SECONDS);
      toast.success(
        "Verification link resent",
        "If " + email + " has a signup waiting, a fresh link is on its way. Check spam too."
      );
    } catch (err) {
      // Most likely the API's rate limit — show its own words.
      const message = extractErrorMessage(err);
      setError(message);
      toast.error("Could not resend the link", message);
    } finally {
      setIsSending(false);
    }
  }

  const isCoolingDown = secondsLeft > 0;

  return (
    <div className="mt-6">
      <p className="text-sm text-neutral">
        {prompt}{" "}
        <button
          type="button"
          onClick={handleResend}
          disabled={disabled || isSending || isCoolingDown}
          className="font-medium text-primary hover:underline disabled:text-neutral disabled:no-underline disabled:cursor-not-allowed"
        >
          {isSending
            ? "Sending…"
            : isCoolingDown
              ? `Resend in ${secondsLeft}s`
              : "Resend link"}
        </button>
      </p>
      {error && <p className="mt-2 text-sm text-alert">{error}</p>}
    </div>
  );
}
