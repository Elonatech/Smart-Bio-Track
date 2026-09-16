"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { appClient } from "./api-client";
import { useAuthStore, type AuthUser } from "./store/auth-store";
import { getDashboardPath } from "./roleRoutes";
import { SAMPLE_FLAGGED_PUNCHES } from "@/app/components/dashboard/flaggedPunchSamples";

export type NotificationVariant = "info" | "success" | "warning" | "alert";

export interface AppNotification {
  /** Stable across reloads — read-state is keyed on this. */
  id: string;
  variant: NotificationVariant;
  title: string;
  description?: string;
  timestamp: Date;
  /** Where "View" should take the user, if anywhere. */
  href?: string;
}

const STALE_INVITE_DAYS = 3;
const MS_PER_DAY = 86_400_000;

// One flat list per organization would need its own model and endpoint —
// there is neither yet (see project_smartbiotrack_known_gaps). Until then
// this composes what already exists:
//
//  - real signals for roles that can see the user directory (a stale
//    invite, someone with no department) — reusing GET /users rather than
//    fabricating anything
//  - the same UI-only flagged-punch samples the Review Queue and
//    Exceptions pages already read (flaggedPunchSamples.ts) — not a
//    second, diverging mock dataset
//  - a small illustrative set for EMPLOYEE, who has no directory
//    visibility and no attendance backend to read from at all
//
// Every entry below is a plain object, not a live subscription — this
// intentionally does not attempt to be real-time. Reopening the panel (or
// the fetch on navbar mount) is what "refreshes" it.
interface DirectoryUser {
  id: string;
  name: string;
  status: "PENDING" | "ACTIVE" | "SUSPENDED";
  departmentId: string | null;
  createdAt: string;
}

/**
 * A stable key for "this exact group of people", used so a notification's
 * id changes when who it is about changes. Sorted so fetch order never
 * matters, and joined rather than hashed — an id that reads as
 * `directory:no-department:3a1c,88fe` is still debuggable in devtools.
 */
function idSignature(users: { id: string }[]): string {
  return users
    .map((u) => u.id)
    .sort()
    .join(",");
}

function buildEmployeeMockNotifications(): AppNotification[] {
  const now = Date.now();
  return [
    {
      id: "mock-shift-reminder",
      variant: "info" as const,
      title: "Reminder: your shift starts at 08:00 WAT.",
      timestamp: new Date(now - 2 * 3_600_000),
    },
    {
      id: "mock-own-punch-flagged",
      variant: "warning" as const,
      title: "Your clock-in was flagged for HR review (GPS accuracy).",
      timestamp: new Date(now - 4 * MS_PER_DAY),
    },
    {
      id: "mock-own-punch-approved",
      variant: "success" as const,
      title: "HR approved your flagged punch.",
      timestamp: new Date(now - 5 * MS_PER_DAY),
    },
    {
      id: "mock-holiday-update",
      variant: "info" as const,
      title: "Holiday calendar updated: Independence Day, 1 Oct.",
      timestamp: new Date(now - 7 * MS_PER_DAY),
    },
  ];
}

// Same samples the Review Queue (HR) and Pending Exceptions (Team Lead)
// pages render — surfaced here too so the bell reflects what those pages
// would show, rather than a third, disconnected opinion of what is
// pending. Spaced a few hours apart only so they do not all show "just
// now" at once; nothing about the spacing is meaningful.
function buildFlaggedPunchNotifications(reviewHref: string): AppNotification[] {
  const now = Date.now();
  return SAMPLE_FLAGGED_PUNCHES.map((punch, index) => ({
    id: `flagged-punch:${punch.id}`,
    variant: "alert" as const,
    title: `New flagged punch: ${punch.reference}`,
    description: `${punch.employeeName} · ${punch.reason}`,
    timestamp: new Date(now - (index + 1) * 3_600_000),
    href: reviewHref,
  }));
}

async function fetchDirectorySignals(
  employeesHref: string
): Promise<AppNotification[]> {
  try {
    // 100 is GET /users' own hard ceiling on `limit` (list-users.dto.ts,
    // MAX_PAGE_SIZE) — asking for more fails validation outright rather
    // than being clamped, which silently produced zero notifications here
    // until caught. There is no "give me counts, not rows" endpoint, so an
    // organization with more than 100 people only has its first page
    // considered; a real notifications endpoint would not have this limit.
    const { data } = await appClient.get<{ items: DirectoryUser[] }>(
      "/users",
      { params: { page: 1, limit: 100 } }
    );

    const notifications: AppNotification[] = [];
    const now = Date.now();

    const staleInvites = data.items.filter(
      (u) =>
        u.status === "PENDING" &&
        now - new Date(u.createdAt).getTime() > STALE_INVITE_DAYS * MS_PER_DAY
    );
    if (staleInvites.length > 0) {
      notifications.push({
        // Keyed on WHO is affected, not just that the condition is true.
        // A static id here would mean "mark as read" is permanent: the
        // first three stale invites get dismissed, three different people
        // go stale next month, and the notification never comes back
        // because its id never changed. Sorted so the same set in a
        // different fetch order still produces the same id.
        id: `directory:stale-invites:${idSignature(staleInvites)}`,
        variant: "warning",
        title:
          staleInvites.length === 1
            ? `${staleInvites[0].name} has not activated their invitation yet.`
            : `${staleInvites.length} invitations have gone unanswered for over ${STALE_INVITE_DAYS} days.`,
        description: "Re-send from their profile, or check they got the email.",
        timestamp: new Date(
          Math.min(...staleInvites.map((u) => new Date(u.createdAt).getTime()))
        ),
        href: employeesHref,
      });
    }

    const noDepartment = data.items.filter(
      (u) => u.status !== "PENDING" && !u.departmentId
    );
    if (noDepartment.length > 0) {
      notifications.push({
        // Same reasoning as stale-invites above: content-addressed, not a
        // fixed label, so a genuinely different set of people is a new,
        // unread notification rather than one that was "already handled"
        // months ago for a completely different set of people.
        id: `directory:no-department:${idSignature(noDepartment)}`,
        variant: "info",
        title:
          noDepartment.length === 1
            ? `${noDepartment[0].name} has no department assigned.`
            : `${noDepartment.length} employees have no department assigned.`,
        description: "They will not appear in department reports until assigned.",
        timestamp: new Date(now - 30 * 60_000),
        href: employeesHref,
      });
    }

    return notifications;
  } catch {
    // A notification feed failing silently beats a red error banner over
    // the whole dashboard for something this non-critical.
    return [];
  }
}

function buildNotificationsForUser(
  user: AuthUser
): Promise<AppNotification[]> | AppNotification[] {
  const root = getDashboardPath(user.role);

  switch (user.role) {
    case "SUPER_ADMIN":
      return fetchDirectorySignals(`${root}/employees`);
    case "HR_ADMIN":
      return Promise.all([
        fetchDirectorySignals(`${root}/employees`),
        Promise.resolve(buildFlaggedPunchNotifications(`${root}/review`)),
      ]).then(([directory, flagged]) => [...directory, ...flagged]);
    case "TEAM_LEAD":
      return buildFlaggedPunchNotifications(`${root}/exceptions`);
    case "EMPLOYEE":
      return buildEmployeeMockNotifications();
    default:
      return [];
  }
}

function readStorageKey(userId: string) {
  return `notifications-read:${userId}`;
}

function loadReadIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(readStorageKey(userId));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveReadIds(userId: string, ids: Set<string>) {
  try {
    localStorage.setItem(readStorageKey(userId), JSON.stringify([...ids]));
  } catch {
    // Read-state is a convenience, not a source of truth — losing it
    // (private browsing, storage disabled) just means everything shows
    // unread again next load, which is safe to ignore.
  }
}

export function useNotifications() {
  const user = useAuthStore((state) => state.user);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    setReadIds(loadReadIds(user.id));

    let isActive = true;
    setIsLoading(true);

    Promise.resolve(buildNotificationsForUser(user))
      .then((items) => {
        if (!isActive) return;
        // Newest first — matches how every other "recent activity" list
        // in the app already orders things.
        setNotifications(
          [...items].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        );
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-runs only
    // when the signed-in user changes, not on every render of a component
    // that calls this hook.
  }, [user?.id, user?.role]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !readIds.has(n.id)).length,
    [notifications, readIds]
  );

  const markAllRead = useCallback(() => {
    if (!user) return;
    const next = new Set(readIds);
    notifications.forEach((n) => next.add(n.id));
    setReadIds(next);
    saveReadIds(user.id, next);
  }, [user, notifications, readIds]);

  const markRead = useCallback(
    (id: string) => {
      if (!user) return;
      const next = new Set(readIds);
      next.add(id);
      setReadIds(next);
      saveReadIds(user.id, next);
    },
    [user, readIds]
  );

  return {
    notifications,
    isLoading,
    unreadCount,
    isRead: (id: string) => readIds.has(id),
    markAllRead,
    markRead,
  };
}
