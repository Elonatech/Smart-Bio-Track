import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { appClient } from "@/lib/api-client";
import type { Office } from "@/app/components/dashboard/OfficeFormModal";

// The Branches page's cached read (see lib/queryClient.ts). The cache is
// cleared on sign-out or a change of user, so one organisation's branches are
// never shown to another.

const OFFICES_KEY = ["offices"] as const;

/** GET /offices, cached: coming back to the page shows the list at once. */
export function useOffices() {
  return useQuery({
    queryKey: OFFICES_KEY,
    queryFn: () => appClient.get<Office[]>("/offices").then((res) => res.data),
  });
}

/** Re-reads the branch list — call after adding, editing or deleting one. */
export function useRefreshOffices(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: OFFICES_KEY }),
    [queryClient]
  );
}
