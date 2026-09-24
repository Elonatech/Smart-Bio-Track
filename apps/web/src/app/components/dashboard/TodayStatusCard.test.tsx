/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { StrictMode } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { TodayStatusCard } from "./TodayStatusCard";
import { useAuthStore } from "@/lib/store/auth-store";

// Regression test for a real bug: refreshing the page while clocked in
// silently cleared the clock-in. Root cause — see TodayStatusCard.tsx's own
// comment above its useState calls — was an effect that restored saved state
// racing against a second effect that wrote state back to storage, with the
// write effect seeing the pre-restore (blank) values one commit before the
// restore actually landed. React's StrictMode (which Next.js has on by
// default in development — see next.config.ts) runs mount effects twice for
// exactly this class of bug, which is why it showed up in real usage but
// wouldn't necessarily show up here without wrapping in <StrictMode>
// ourselves, the same way Next.js already does at the app root.

const USER_ID = "user-today-status-test";

function storageKey(userId: string) {
  return `today-status:${userId}`;
}

function todayKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function signInAs(userId: string) {
  useAuthStore.setState({
    user: {
      id: userId,
      email: "test@example.com",
      role: "EMPLOYEE",
      organizationId: "org-1",
    },
    accessToken: "test-token",
    isAuthenticated: true,
    hasRestored: true,
  });
}

describe("TodayStatusCard — sessionStorage persistence", () => {
  beforeEach(() => {
    sessionStorage.clear();
    signInAs(USER_ID);
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      hasRestored: false,
    });
  });

  it("shows a clocked-in state restored from a previous session, and does not clear it back out", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    sessionStorage.setItem(
      storageKey(USER_ID),
      JSON.stringify({
        date: todayKey(new Date()),
        clockedInAt: fiveMinutesAgo.toISOString(),
        clockedOutAt: null,
        breakStartedAt: null,
        completedBreakSeconds: 0,
      })
    );

    act(() => {
      render(
        <StrictMode>
          <TodayStatusCard />
        </StrictMode>
      );
    });

    // The bug's user-visible symptom: this read "Not clocked in yet" even
    // though a shift was saved.
    expect(screen.getByText("Clocked In")).toBeInTheDocument();
    expect(screen.queryByText("Not clocked in yet")).not.toBeInTheDocument();

    // The bug's actual mechanism: the restored value got immediately
    // overwritten with nulls in sessionStorage itself, a moment after being
    // read — so a SECOND mount (a second refresh) would find nothing to
    // restore even though the first one appeared to work. Asserting on
    // storage directly, not just the screen, is what catches that.
    const stored = JSON.parse(sessionStorage.getItem(storageKey(USER_ID)) ?? "null");
    expect(stored?.clockedInAt).toBe(fiveMinutesAgo.toISOString());
  });

  it("starts blank when there is nothing saved for this user", () => {
    act(() => {
      render(
        <StrictMode>
          <TodayStatusCard />
        </StrictMode>
      );
    });

    expect(screen.getByText("Not clocked in yet")).toBeInTheDocument();
  });

  it("keeps one user's shift out of another user's card on the same browser", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    sessionStorage.setItem(
      storageKey("someone-else"),
      JSON.stringify({
        date: todayKey(new Date()),
        clockedInAt: fiveMinutesAgo.toISOString(),
        clockedOutAt: null,
        breakStartedAt: null,
        completedBreakSeconds: 0,
      })
    );

    // Signed in as USER_ID, not "someone-else" — their saved shift must not
    // leak across, the same way notifications.ts's read-state doesn't.
    act(() => {
      render(
        <StrictMode>
          <TodayStatusCard />
        </StrictMode>
      );
    });

    expect(screen.getByText("Not clocked in yet")).toBeInTheDocument();
  });

  it("treats a shift left open from a previous day as stale, not resumable", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    sessionStorage.setItem(
      storageKey(USER_ID),
      JSON.stringify({
        date: todayKey(yesterday),
        clockedInAt: yesterday.toISOString(),
        clockedOutAt: null,
        breakStartedAt: null,
        completedBreakSeconds: 0,
      })
    );

    act(() => {
      render(
        <StrictMode>
          <TodayStatusCard />
        </StrictMode>
      );
    });

    expect(screen.getByText("Not clocked in yet")).toBeInTheDocument();
  });
});
