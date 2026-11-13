import { QueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/store/auth-store";

// The one cache of API answers (TanStack Query). A screen you've already
// visited shows its last answer at once and refreshes it in the background,
// instead of starting from "Loading…" every time.

/** Settings every screen shares. */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // An answer younger than this is shown without asking again. Short:
        // attendance changes during the day, and other people punch too.
        staleTime: 30_000,
        // How long an answer no screen is showing is kept. The default (5
        // minutes) meant leaving the Overview for longer brought back
        // "Loading…" on return. A working day instead; sign-out still
        // empties everything (clearCacheOnSignOut below).
        gcTime: 12 * 60 * 60 * 1000,
        // One retry covers a blip; more would keep a broken screen spinning.
        retry: 1,
      },
    },
  });
}

/**
 * Empties the cache whenever the signed-in person changes or signs out —
 * including a session that expires on its own. Offices often share one
 * computer, and the next person must never see the last one's days, even
 * for a moment. Returns the unsubscribe function.
 */
export function clearCacheOnSignOut(queryClient: QueryClient): () => void {
  return useAuthStore.subscribe((state, previous) => {
    if (previous.user && state.user?.id !== previous.user.id) queryClient.clear();
  });
}
