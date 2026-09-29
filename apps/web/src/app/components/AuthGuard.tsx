"use client";

import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth-store";

// Wrap any protected page's content with this. Until the one-time session
// restore has finished (see lib/session.ts), we render nothing rather than
// flashing the sign-in screen at someone who is signed in. Once it has, either
// the real page renders or this prompt does.
//
// That window is longer than it used to be, and worth understanding: restoring
// a session is now a round trip to the server rather than a synchronous
// localStorage read. Rendering the sign-in prompt during it would show "Sign
// in to continue" for a few hundred milliseconds on every single page load.
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hasRestored = useAuthStore((state) => state.hasRestored);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!hasRestored) {
    return null;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="w-full max-w-sm bg-surface rounded-xl border border-neutral/20 p-8 text-center">
          <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <h2 className="text-lg font-semibold text-heading mb-2">
            Sign in to continue
          </h2>
          <p className="text-sm text-neutral mb-6">
            This area requires an authenticated SmartBioTrack session.
          </p>
          <button
            type="button"
            onClick={() => router.push("/auth/login")}
            className="w-full rounded-md bg-primary text-white py-2.5 text-sm font-medium hover:bg-primary/90"
          >
            Go to sign in
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
