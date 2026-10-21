/**
 * @jest-environment jsdom
 */
import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TodayStatusCard } from "./TodayStatusCard";
import { appClient } from "@/lib/api-client";

/**
 * The status card on every role's dashboard, now backed by the Phase 3
 * attendance API. What's worth pinning:
 *
 *  - The SERVER decides the state. The card reads GET /attendance/today and
 *    re-reads after every punch, so it can't drift from what's recorded.
 *  - Its refusals ("You are already on a break.") reach the person in the
 *    server's own words.
 *  - Times shown come from the punches, never the browser clock.
 *
 * The old version kept a local-only loop in sessionStorage; its tests (a
 * StrictMode restore race) went with it. StrictMode is kept below because
 * the double-mount still exercises the load effect.
 */

jest.mock("@/lib/api-client", () => ({
  appClient: { get: jest.fn(), post: jest.fn() },
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : "Something went wrong",
}));

const success = jest.fn();
const error = jest.fn();
jest.mock("@/app/components/Toast", () => ({
  useToast: () => ({ success, error, info: jest.fn() }),
}));

// ClockInFlow has its own location + map logic; this suite is about the card.
jest.mock("@/app/components/dashboard/ClockInFlow", () => ({
  ClockInFlow: () => <div>Clock-in flow</div>,
}));

const mockGet = appClient.get as jest.Mock;
const mockPost = appClient.post as jest.Mock;

const at = (time: string) => `2026-10-16T${time}:00.000Z`;

function today(state: string, punches: { type: string; occurredAt: string }[]) {
  return {
    data: {
      workDate: "2026-10-16",
      timeZone: "Africa/Lagos",
      state,
      punches: punches.map((p, i) => ({ id: `p${i}`, ...p })),
    },
  };
}

function renderCard() {
  return render(
    <StrictMode>
      <TodayStatusCard />
    </StrictMode>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  // No geolocation in jsdom: readPositionQuietly resolves null, which is
  // exactly the "location unavailable" case punches must survive.
  mockPost.mockResolvedValue({ data: {} });
});

describe("showing today", () => {
  it("reads the state from the server", async () => {
    mockGet.mockResolvedValue(today("NOT_STARTED", []));
    renderCard();

    expect(await screen.findByText("Not clocked in yet")).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith("/attendance/today");
    expect(screen.getByRole("button", { name: /Clock In/ })).toBeInTheDocument();
  });

  it("shows break and clock-out once clocked in", async () => {
    mockGet.mockResolvedValue(today("CLOCKED_IN", [{ type: "CLOCK_IN", occurredAt: at("08:00") }]));
    renderCard();

    expect(await screen.findByText("Clocked In")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start Break/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Clock Out/ })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Clock In/ })).not.toBeInTheDocument();
  });

  it("blocks clock-out during a break and says why, matching the server's rule", async () => {
    mockGet.mockResolvedValue(
      today("ON_BREAK", [
        { type: "CLOCK_IN", occurredAt: at("08:00") },
        { type: "BREAK_START", occurredAt: at("12:00") },
      ])
    );
    renderCard();

    expect(await screen.findByText("On break")).toBeInTheDocument();
    const clockOut = screen.getByRole("button", { name: /Clock Out/ });
    expect(clockOut).toBeDisabled();
    expect(clockOut).toHaveAttribute("title", "End your break before clocking out.");
  });

  it("offers Clock In again after clocking out — a second shift is allowed", async () => {
    mockGet.mockResolvedValue(
      today("CLOCKED_OUT", [
        { type: "CLOCK_IN", occurredAt: at("08:00") },
        { type: "CLOCK_OUT", occurredAt: at("16:00") },
      ])
    );
    renderCard();

    expect(await screen.findByText("Clocked Out")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Clock In/ })).toBeInTheDocument();
    // 8 hours worked, computed from the punches.
    expect(screen.getAllByText("08:00:00").length).toBeGreaterThan(0);
  });

  it("offers a retry when today's attendance can't load", async () => {
    // Twice: StrictMode mounts the card twice, so both first loads must fail.
    mockGet
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockResolvedValue(today("NOT_STARTED", []));
    renderCard();

    expect(await screen.findByText("Network Error")).toBeInTheDocument();

    await userEvent.click(await screen.findByRole("button", { name: /Try again/ }));

    expect(await screen.findByText("Not clocked in yet")).toBeInTheDocument();
  });
});

describe("punching", () => {
  it("starts a break through the API, then re-reads the server state", async () => {
    mockGet
      .mockResolvedValueOnce(today("CLOCKED_IN", [{ type: "CLOCK_IN", occurredAt: at("08:00") }]))
      .mockResolvedValueOnce(today("CLOCKED_IN", [{ type: "CLOCK_IN", occurredAt: at("08:00") }]))
      .mockResolvedValue(
        today("ON_BREAK", [
          { type: "CLOCK_IN", occurredAt: at("08:00") },
          { type: "BREAK_START", occurredAt: at("12:00") },
        ])
      );
    renderCard();

    await userEvent.click(await screen.findByRole("button", { name: /Start Break/ }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/attendance/break-start", {})
    );
    expect(await screen.findByText("On break")).toBeInTheDocument();
    expect(success).toHaveBeenCalledWith("Break started", expect.any(String));
  });

  it("clocks out through the API", async () => {
    mockGet.mockResolvedValue(today("CLOCKED_IN", [{ type: "CLOCK_IN", occurredAt: at("08:00") }]));
    renderCard();

    await userEvent.click(await screen.findByRole("button", { name: /Clock Out/ }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/attendance/clock-out", {})
    );
  });

  it("switches to the new state at once, before the server answers", async () => {
    mockGet.mockResolvedValue(today("CLOCKED_IN", [{ type: "CLOCK_IN", occurredAt: at("08:00") }]));
    // A save that hasn't come back yet.
    mockPost.mockReturnValueOnce(new Promise(() => {}));
    renderCard();

    await userEvent.click(await screen.findByRole("button", { name: /Start Break/ }));

    expect(await screen.findByText("On break")).toBeInTheDocument();
    // Disabled meanwhile, so a double tap can't send a second punch.
    expect(screen.getByRole("button", { name: /End Break/ })).toBeDisabled();
  });

  it("puts the card back when the server refuses", async () => {
    mockGet.mockResolvedValue(today("CLOCKED_IN", [{ type: "CLOCK_IN", occurredAt: at("08:00") }]));
    mockPost.mockRejectedValueOnce(new Error("You are already on a break."));
    renderCard();

    await userEvent.click(await screen.findByRole("button", { name: /Start Break/ }));

    // The re-read restores what the server actually has.
    expect(await screen.findByRole("button", { name: /Start Break/ })).toBeEnabled();
    expect(screen.queryByText("On break")).not.toBeInTheDocument();
  });

  it("shows the server's refusal in its own words", async () => {
    mockGet.mockResolvedValue(today("CLOCKED_IN", [{ type: "CLOCK_IN", occurredAt: at("08:00") }]));
    mockPost.mockRejectedValueOnce(new Error("You are already on a break."));
    renderCard();

    await userEvent.click(await screen.findByRole("button", { name: /Start Break/ }));

    await waitFor(() =>
      expect(error).toHaveBeenCalledWith("That didn't go through", "You are already on a break.")
    );
  });
});

describe("times", () => {
  it("shows clock-in in the organisation's zone from the response, not the viewer's", async () => {
    // 07:00 UTC is 08:00 in Lagos. The test machine isn't in Lagos, so seeing
    // 08:00 proves the response's timeZone was used (decision 1.1).
    mockGet.mockResolvedValue(today("CLOCKED_IN", [{ type: "CLOCK_IN", occurredAt: at("07:00") }]));
    renderCard();

    expect(await screen.findByText(/^08:00/)).toBeInTheDocument();
  });
});
