/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { ClockInResult } from "./ClockInResult";
import {
  formatRecordedTime,
  previewOutcomeFromUrl,
  submitClockIn,
} from "./clockInOutcome";

// A fixed server instant, so nothing below depends on when the test runs.
const RECORDED_AT = "2026-08-10T08:12:00.000Z";

/**
 * The three clock-in outcomes. Approved, flagged and rejected mean different
 * things to the employee, so each has to say its own thing: flagged must not
 * read as a failure (the time IS counted) and rejected must not read as
 * recorded.
 */

function renderResult(outcome: Parameters<typeof ClockInResult>[0]["outcome"]) {
  const onDone = jest.fn();
  const onRetry = jest.fn();
  render(
    <ClockInResult
      outcome={outcome}
      onDone={onDone} 
      onRetry={onRetry}
    />,
  );
  return { onDone, onRetry };
}

describe("ClockInResult", () => {
  it("approved: confirms the time and offers no retry", () => {
    renderResult({ status: "approved", recordedAt: RECORDED_AT });

    expect(screen.getByText("You're clocked in")).toBeInTheDocument();
    // The exact clock reading depends on the machine's timezone (see the
    // formatRecordedTime tests below); what matters here is that a time
    // and a named zone are shown.
    expect(screen.getByText(/recorded at \d{2}:\d{2} \S+/)).toBeInTheDocument();
    expect(screen.queryByText("Try again")).not.toBeInTheDocument();
  });

  it("flagged: says it was recorded but is under review, and shows why", () => {
    renderResult({
      status: "flagged",
      recordedAt: RECORDED_AT,
      reasons: ["GPS accuracy below threshold"],
    });

    expect(screen.getByText(/pending review/i)).toBeInTheDocument();
    expect(
      screen.getByText(/was recorded, but HR will review/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText("GPS accuracy below threshold"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Try again")).not.toBeInTheDocument();
  });

  it("rejected: says nothing was recorded, lists every reason, and can retry", () => {
    const { onRetry, onDone } = renderResult({
      status: "rejected",
      reasons: ["Not on the office network", "Identity not confirmed"],
    });

    expect(screen.getByText("Clock-in not accepted")).toBeInTheDocument();
    expect(screen.getByText(/was not recorded/i)).toBeInTheDocument();
    expect(screen.getByText("Not on the office network")).toBeInTheDocument();
    expect(screen.getByText("Identity not confirmed")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Try again"));
    expect(onRetry).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Close"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("announces politely rather than interrupting", () => {
    renderResult({ status: "approved", recordedAt: RECORDED_AT });

    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("formatRecordedTime", () => {
  // One server instant, read on three different wall clocks. This is the
  // reason the backend sends UTC: nobody's screen is wrong, each reader just
  // sees their own time.
  it("shows the same UTC instant in the reader's own timezone", () => {
    expect(formatRecordedTime(RECORDED_AT, "UTC")).toMatch(/^08:12 UTC$/);
    expect(formatRecordedTime(RECORDED_AT, "Africa/Lagos")).toMatch(/^09:12 /);
    expect(formatRecordedTime(RECORDED_AT, "America/New_York")).toMatch(
      /^04:12 /,
    );
  });

  it("always names the zone", () => {
    expect(formatRecordedTime(RECORDED_AT, "Africa/Lagos")).toMatch(
      /^\d{2}:\d{2} \S+$/,
    );
  });
});

describe("preview outcomes", () => {
  afterEach(() => {
    window.history.pushState({}, "", "/");
    jest.restoreAllMocks();
  });

  it("is off unless asked for", () => {
    expect(previewOutcomeFromUrl()).toBeNull();
  });

  it("forces flagged or rejected from the URL in development", () => {
    window.history.pushState({}, "", "/?clockin-outcome=flagged");
    expect(previewOutcomeFromUrl()?.status).toBe("flagged");

    window.history.pushState({}, "", "/?clockin-outcome=rejected");
    expect(previewOutcomeFromUrl()?.status).toBe("rejected");
  });

  it('ignores anything else, including "approved"', () => {
    window.history.pushState({}, "", "/?clockin-outcome=approved");
    expect(previewOutcomeFromUrl()).toBeNull();
  });

  it("is ignored entirely in production", () => {
    window.history.pushState({}, "", "/?clockin-outcome=rejected");
    jest.replaceProperty(process.env, "NODE_ENV", "production");

    expect(previewOutcomeFromUrl()).toBeNull();
  });

  it("the local stand-in approves by default", async () => {
    jest.useFakeTimers();
    const pending = submitClockIn();
    jest.advanceTimersByTime(600);

    // The timestamp is a UTC ISO string (server-style), not a local time.
    await expect(pending).resolves.toEqual({
      status: "approved",
      recordedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
    });
    jest.useRealTimers();
  });
});
