"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Check,
  CircleCheck,
  Info,
  TriangleAlert,
  OctagonAlert,
  X,
} from "lucide-react";
import {
  useNotifications,
  type AppNotification,
  type NotificationVariant,
} from "@/lib/notifications";
import { formatRelativeTime } from "@/lib/relativeTime";

const VARIANT_META: Record<
  NotificationVariant,
  { icon: typeof Info; iconClass: string; bgClass: string }
> = {
  info: { icon: Info, iconClass: "text-primary", bgClass: "bg-primary/10" },
  success: {
    icon: CircleCheck,
    iconClass: "text-success",
    bgClass: "bg-success/10",
  },
  warning: {
    icon: TriangleAlert,
    iconClass: "text-warning",
    bgClass: "bg-warning/10",
  },
  alert: {
    icon: OctagonAlert,
    iconClass: "text-alert",
    bgClass: "bg-alert/10",
  },
};

function NotificationRow({
  notification,
  isRead,
  onNavigate,
  onMarkRead,
}: {
  notification: AppNotification;
  isRead: boolean;
  onNavigate: () => void;
  onMarkRead: () => void;
}) {
  const meta = VARIANT_META[notification.variant];
  const Icon = meta.icon;

  // The "Mark as read" link is its own control, separate from the row's
  // navigation — without that split, a mock notification with nowhere to
  // link (a shift reminder, a holiday update) had no visible way to
  // dismiss it at all, and a real one's only affordance was "click the
  // whole row and hope it does something."
  const body = (
    <>
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${meta.bgClass} ${meta.iconClass}`}
      >
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm ${isRead ? "text-neutral" : "font-medium text-heading"}`}
        >
          {notification.title}
        </p>
        {notification.description && (
          <p className="mt-0.5 text-xs text-neutral">
            {notification.description}
          </p>
        )}
        <div className="mt-1 flex items-center gap-3">
          <p className="text-[11px] text-neutral">
            {formatRelativeTime(notification.timestamp)}
          </p>
          {!isRead && (
            <button
              type="button"
              onClick={(event) => {
                // Stops a click here from also triggering the row's own
                // Link/onClick navigation above it in the DOM.
                event.preventDefault();
                event.stopPropagation();
                onMarkRead();
              }}
              className="text-[11px] font-medium text-primary hover:underline"
            >
              Mark as read
            </button>
          )}
        </div>
      </div>
      {!isRead && (
        <span
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
          aria-label="Unread"
        />
      )}
    </>
  );

  const rowClass =
    "flex items-start gap-3 px-4 py-3 border-b border-neutral/10 last:border-b-0";

  if (notification.href) {
    return (
      <Link
        href={notification.href}
        onClick={onNavigate}
        className={`${rowClass} hover:bg-neutral/5 transition-colors`}
      >
        {body}
      </Link>
    );
  }

  return <div className={rowClass}>{body}</div>;
}

export function NotificationPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const { notifications, isLoading, unreadCount, isRead, markAllRead, markRead } =
    useNotifications();

  // Escape closes it, matching every other dismissible surface (modals,
  // the mobile nav drawer). A backdrop click does the same via its own
  // onClick below.
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Notifications"
        aria-expanded={isOpen}
        className="relative rounded-md p-2 text-neutral hover:bg-neutral/10"
      >
        <Bell className="h-5 w-5" strokeWidth={1.75} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-alert px-1 text-[10px] text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

 
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

    
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-neutral/20 bg-surface shadow-lg transition-transform duration-200 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral/10 px-5 py-4">
          <h2 className="text-base font-semibold text-heading">Notifications</h2>
          <div className="flex items-center gap-4">
            {/* Always present rather than only appearing once there is
                something to do — hiding it made the header's own shape
                change as items got marked read, and meant nobody could
                tell the feature existed until they happened to have
                something unread. Disabled instead, same as any other
                control with nothing to act on. */}
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:text-neutral disabled:no-underline disabled:cursor-not-allowed"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              Mark all as read
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close"
              className="text-neutral hover:text-heading"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="px-5 py-6 text-center text-sm text-neutral">
              Loading...
            </p>
          ) : notifications.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-neutral">
              Nothing to catch up on.
            </p>
          ) : (
            notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                isRead={isRead(notification.id)}
                onNavigate={() => {
                  markRead(notification.id);
                  setIsOpen(false);
                }}
                onMarkRead={() => markRead(notification.id)}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}
