/**
 * @jest-environment jsdom
 */
import EmployeeAttendancePage from "./page";
import { appClient } from "@/lib/api-client";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";
import userEvent from "@testing-library/user-event";

/**
 * The employee's own history, from GET /attendance/history. Worth pinning:
 * each day's label is derived honestly from the summary (late vs on time vs
 * still going vs never clocked out), and the range picker asks the server
 * for the right window rather than filtering a fixed list.
 */

jest.mock("@/lib/api-client", () => ({
  appClient: { get: jest.fn() },
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : "Something went wrong",
}));

const mockGet = appClient.get as jest.Mock;

function day(workDate: string, overrides: Record<string, unknown> = {}) {
  return {
    workDate,
    status: "PRESENT",
    firstClockIn: `${workDate}T08:00:00.000Z`,
    lastClockOut: `${workDate}T16:30:00.000Z`,
    workedMinutes: 480,
    breakMinutes: 30,
    overtimeMinutes: 0,
    isLate: false,
    lateMinutes: 0,
    isIncomplete: false,
    ...overrides,
  };
}

function history(days: ReturnType<typeof day>[]) {
  return { data: { from: "2026-09-17", to: "2026-10-16", timeZone: "Africa/Lagos", days } };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it("loads the last 30 days by default", async () => {
  mockGet.mockResolvedValue(history([day("2026-10-16")]));
  renderWithProviders(<EmployeeAttendancePage />);

  await waitFor(() => expect(mockGet).toHaveBeenCalled());
  const [url, options] = mockGet.mock.calls[0];
  expect(url).toBe("/attendance/history");
  expect(options.params.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

it("shows worked, break and overtime from the summary", async () => {
  mockGet.mockResolvedValue(history([day("2026-10-16", { overtimeMinutes: 45 })]));
  renderWithProviders(<EmployeeAttendancePage />);

  expect((await screen.findAllByText("8h 00m")).length).toBeGreaterThan(0);
  expect(screen.getAllByText("30m").length).toBeGreaterThan(0);
  expect(screen.getAllByText("45m").length).toBeGreaterThan(0);
});

it("labels each day honestly from the summary", async () => {
  mockGet.mockResolvedValue(
    history([
      day("2026-10-16", { lastClockOut: null }),
      day("2026-10-15", { isLate: true, lateMinutes: 12 }),
      day("2026-10-14", { lastClockOut: null, isIncomplete: true }),
      day("2026-10-13", { status: "ABSENT", firstClockIn: null, lastClockOut: null, workedMinutes: 0 }),
      day("2026-10-12"),
    ])
  );
  renderWithProviders(<EmployeeAttendancePage />);

  expect((await screen.findAllByText("In progress")).length).toBeGreaterThan(0);
  expect(screen.getAllByText("Late · 12m").length).toBeGreaterThan(0);
  expect(screen.getAllByText("No clock-out").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Absent").length).toBeGreaterThan(0);
  expect(screen.getAllByText("On time").length).toBeGreaterThan(0);
});

it("does not invent a branch or a trust score", async () => {
  mockGet.mockResolvedValue(history([day("2026-10-16")]));
  renderWithProviders(<EmployeeAttendancePage />);
  await screen.findAllByText("On time");

  expect(screen.queryByText(/trust score/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/^branch$/i)).not.toBeInTheDocument();
});

it("filters by status without asking the server again", async () => {
  mockGet.mockResolvedValue(
    history([day("2026-10-16"), day("2026-10-15", { isLate: true, lateMinutes: 5 })])
  );
  renderWithProviders(<EmployeeAttendancePage />);
  await screen.findAllByText("On time");

  const filters = screen.getByRole("button", { name: "All" }).parentElement as HTMLElement;
  await userEvent.click(within(filters).getByRole("button", { name: "Late" }));

  expect(screen.queryAllByText("On time").filter((el) => el.tagName === "SPAN")).toHaveLength(0);
  expect(screen.getAllByText("Late · 5m").length).toBeGreaterThan(0);
  expect(mockGet).toHaveBeenCalledTimes(1);
});

it("asks the server for a longer window when the range changes", async () => {
  mockGet.mockResolvedValue(history([]));
  renderWithProviders(<EmployeeAttendancePage />);
  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
  const firstFrom = mockGet.mock.calls[0][1].params.from;

  await userEvent.selectOptions(screen.getByRole("combobox"), "90");

  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  expect(mockGet.mock.calls[1][1].params.from < firstFrom).toBe(true);
});

it("says so plainly when there is nothing in the range", async () => {
  mockGet.mockResolvedValue(history([]));
  renderWithProviders(<EmployeeAttendancePage />);

  expect(await screen.findByText("No attendance recorded in the last 30 days.")).toBeInTheDocument();
});

it("shows the error and retries", async () => {
  mockGet
    .mockRejectedValueOnce(new Error("Network Error"))
    .mockResolvedValue(history([day("2026-10-16")]));
  renderWithProviders(<EmployeeAttendancePage />);

  expect(await screen.findByText(/Network Error/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Try again/ }));

  expect((await screen.findAllByText("On time")).length).toBeGreaterThan(0);
});

it("shows a late arrival as late while their shift is still going", async () => {
  // Found in the Phase 3 exit-demo rehearsal: in at 15:45 against an 08:00
  // start, not yet clocked out — the server says isLate, and the page used
  // to say only "In progress", hiding the lateness until clock-out.
  mockGet.mockResolvedValue(
    history([day("2026-10-21", { lastClockOut: null, isLate: true, lateMinutes: 455 })])
  );
  renderWithProviders(<EmployeeAttendancePage />);

  expect((await screen.findAllByText("Late · 455m")).length).toBeGreaterThan(0);
  expect(screen.getAllByText("In progress").length).toBeGreaterThan(0);

  // And the Late filter finds it.
  const filters = screen.getByRole("button", { name: "All" }).parentElement as HTMLElement;
  await userEvent.click(within(filters).getByRole("button", { name: "Late" }));
  expect(screen.getAllByText("Late · 455m").length).toBeGreaterThan(0);
});
