"use client";

import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth-store";

// Wrap any protected page's content with this. While the auth store
// hasn't finished hydrating from localStorage yet (see auth-store.ts's
// `hydrate`), we render nothing rather than flashing the sign-in
// screen for a split second on every page load. Once hydrated, either
// the real page renders (session found) or this sign-in prompt does.
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isHydrated) {
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
