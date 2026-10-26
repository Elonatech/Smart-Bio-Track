import { useCallback } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchHistory, fetchToday, type TodayAttendance } from "@/lib/attendance";
import { useAuthStore } from "@/lib/store/auth-store";

// The attendance screens' cached reads (see lib/queryClient.ts). Every key
// starts with ["attendance", userId], so one call refreshes them all after a
// punch — the status card and the Overview charts can't disagree — and the
// signed-in person is part of every key.

function useUserId(): string {
  return useAuthStore((state) => state.user?.id) ?? "signed-out";
}

/** GET /attendance/today, cached. */
export function useTodayAttendance() {
  const userId = useUserId();
  return useQuery({ queryKey: ["attendance", userId, "today"], queryFn: fetchToday });
}

/**
 * Edits the cached "today" answer in place — for the status card's instant
 * (optimistic) update while a punch is on its way. The re-read that follows
 * replaces it with the server's answer.
 */
export function useUpdateTodayAttendance() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useCallback(
    (update: (current: TodayAttendance | undefined) => TodayAttendance | undefined) => {
      const queryKey = ["attendance", userId, "today"];
      // A read already in flight would land after this and undo it.
      void queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<TodayAttendance>(queryKey, update);
    },
    [queryClient, userId]
  );
}

/** GET /attendance/history from `from` ("YYYY-MM-DD") to today, cached per window. */
export function useAttendanceHistory(from: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: ["attendance", userId, "history", from],
    queryFn: () => fetchHistory(from),
    // Switching range keeps the old rows on screen until the new ones land,
    // rather than flashing "Loading…".
    placeholderData: keepPreviousData,
  }); 
}

/** Re-reads every attendance screen — call after a punch, or a refusal. */
export function useRefreshAttendance(): () => Promise<void> {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["attendance", userId] }),
    [queryClient, userId]
  );
}
