/**
 * @jest-environment jsdom
 */
import { ClockInFlow } from "./ClockInFlow";
import { appClient } from "@/lib/api-client";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The clock-in screen, against the Phase 3 Manual's decision 6: location is
 * recorded with the punch, never enforced. So the geo-fence is a hint — the
 * person can clock in from outside it, with location blocked, or with no
 * branches set up, and is told plainly what was found. Only a still-running
 * location check holds the button.
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

const mockGet = appClient.get as jest.Mock;
const mockPost = appClient.post as jest.Mock;

const HQ = { id: "o1", name: "Lagos HQ", latitude: 6.5244, longitude: 3.3792, geofenceRadiusMeters: 150 };

type GeoSuccess = (position: { coords: { latitude: number; longitude: number; accuracy: number } }) => void;
type GeoError = (error: { code: number; message: string }) => void;

/** Puts the device at a point, or makes the browser refuse location. */
function deviceAt(point: { latitude: number; longitude: number } | "denied" | "pending") {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (ok: GeoSuccess, fail: GeoError) => {
        if (point === "pending") return;
        if (point === "denied") fail({ code: 1, message: "User denied Geolocation" });
        else ok({ coords: { ...point, accuracy: 12 } });
      },
    },
  });
}

const renderFlow = () =>
  render(<ClockInFlow onClose={jest.fn()} onConfirmed={jest.fn()} />);

const confirmButton = () => screen.getByRole("button", { name: /Confirm clock-in|Checking your location/ });

beforeEach(() => {
  jest.clearAllMocks();
  window.history.pushState({}, "", "/");
  mockGet.mockResolvedValue({ data: [HQ] });
  mockPost.mockResolvedValue({
    data: { state: "CLOCKED_IN", punch: { id: "p1", type: "CLOCK_IN", occurredAt: "2026-10-20T07:01:00.000Z" } },
  });
});

it("lets you clock in from outside the geo-fence, with a warning", async () => {
  // About 3 km north of HQ.
  deviceAt({ latitude: 6.55, longitude: 3.3792 });
  renderFlow();

  expect(await screen.findByText(/appear to be outside Lagos HQ's geo-fence/)).toBeInTheDocument();
  expect(confirmButton()).toBeEnabled();

  await userEvent.click(confirmButton());
  await waitFor(() =>
    expect(mockPost).toHaveBeenCalledWith("/attendance/clock-in", {
      latitude: 6.55,
      longitude: 3.3792,
      accuracyMeters: 12,
    })
  );
});

it("lets you clock in when location is blocked, recorded without one", async () => {
  deviceAt("denied");
  renderFlow();

  expect(await screen.findByText(/recorded without one/)).toBeInTheDocument();
  await userEvent.click(confirmButton());

  await waitFor(() => expect(mockPost).toHaveBeenCalledWith("/attendance/clock-in", {}));
});

it("shows no warning inside the geo-fence", async () => {
  deviceAt({ latitude: HQ.latitude, longitude: HQ.longitude });
  renderFlow();

  expect(await screen.findByText(/Within Lagos HQ's geo-fence/)).toBeInTheDocument();
  expect(screen.queryByText(/appear to be outside/)).not.toBeInTheDocument();
  expect(confirmButton()).toBeEnabled();
});

it("only holds the button while the location check is still running", async () => {
  deviceAt("pending");
  renderFlow();

  expect(confirmButton()).toBeDisabled();
  expect(confirmButton()).toHaveTextContent("Checking your location…");
});

it('says "Not recorded" when the punch never reached the server', async () => {
  deviceAt({ latitude: HQ.latitude, longitude: HQ.longitude });
  // An axios-style network failure: no response at all.
  mockPost.mockRejectedValueOnce(Object.assign(new Error("Network Error"), { isAxiosError: true }));
  renderFlow();
  await screen.findByText(/Within Lagos HQ's geo-fence/);

  await userEvent.click(confirmButton());

  await waitFor(() =>
    expect(error).toHaveBeenCalledWith(
      "Couldn't clock you in",
      "Not recorded — check your connection and try again."
    )
  );
});

it("shows the server's own words when it refuses", async () => {
  deviceAt({ latitude: HQ.latitude, longitude: HQ.longitude });
  mockPost.mockRejectedValueOnce(
    Object.assign(new Error("You are already clocked in."), { isAxiosError: true, response: { status: 409 } })
  );
  renderFlow();
  await screen.findByText(/Within Lagos HQ's geo-fence/);

  await userEvent.click(confirmButton());

  await waitFor(() =>
    expect(error).toHaveBeenCalledWith("Couldn't clock you in", "You are already clocked in.")
  );
});
