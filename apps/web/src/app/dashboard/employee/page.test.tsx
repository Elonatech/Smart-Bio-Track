/**
 * @jest-environment jsdom
 */
import EmployeeDashboardPage from "./page";
import { appClient } from "@/lib/api-client";
import { localToday } from "@/lib/orgToday";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";

/**
 * The employee overview's week bars, month calendar and recent activity,
 * from GET /attendance/history. Worth pinning: a day the server has no row
 * for shows as "No record" (never guessed), days after today are upcoming,
 * and a day's status means the same here as on the History page.
 */

jest.mock("@/lib/api-client", () => ({
  appClient: { get: jest.fn(), post: jest.fn() },
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : "Something went wrong",
}));

const mockGet = appClient.get as jest.Mock;
const ZONE = "Africa/Lagos";

// Dates relative to the real today, so the tests hold on any day.
const today = localToday(new Date(), ZONE).date;
function daysAgo(n: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

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

/** Answers each endpoint the page (and its status card) asks for. */
function serve(days: ReturnType<typeof day>[], historyError?: Error) {
  mockGet.mockImplementation((url: string) => {
    if (url === "/attendance/history") {
      return historyError
        ? Promise.reject(historyError)
        : Promise.resolve({ data: { from: daysAgo(40), to: today, timeZone: ZONE, days } });
    }
    if (url === "/attendance/today") {
      return Promise.resolve({
        data: { workDate: today, timeZone: ZONE, state: "NOT_STARTED", punches: [] },
      });
    }
    if (url === "/organization") return Promise.resolve({ data: { timezone: ZONE } });
    return Promise.resolve({ data: [] });
  });
}

const cellFor = (date: string) =>
  document.querySelector(`[data-status][title^="${titleDate(date)}"]`);
function titleDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

beforeEach(() => {
  jest.clearAllMocks();
});

it("asks for one history window that covers the month and the week", async () => {
  serve([]);
  renderWithProviders(<EmployeeDashboardPage />);

  await waitFor(() =>
    expect(mockGet).toHaveBeenCalledWith("/attendance/history", expect.anything())
  );
  const calls = mockGet.mock.calls.filter(([url]) => url === "/attendance/history");
  expect(calls).toHaveLength(1);
  expect(calls[0][1].params.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

it("no longer shows the sample-data notices", async () => {
  serve([]);
  renderWithProviders(<EmployeeDashboardPage />);

  await screen.findByText("Recent activity");
  expect(screen.queryByText(/example figures/)).not.toBeInTheDocument();
  expect(screen.queryByText(/sample data/i)).not.toBeInTheDocument();
});

it("colours today from the server's summary, using the shared day kinds", async () => {
  serve([day(today, { isLate: true, lateMinutes: 12 })]);
  renderWithProviders(<EmployeeDashboardPage />);

  await screen.findByText("Recent activity");
  // Today appears in both the week and the month; both say Late.
  const cells = document.querySelectorAll(`[data-status][title^="${titleDate(today)}"]`);
  expect(cells.length).toBe(2);
  cells.forEach((cell) => expect(cell).toHaveAttribute("data-status", "LATE"));
});

it('shows a day with no row as "No record", never as present or absent', async () => {
  // Yesterday is in this month unless today is the 1st — then use today.
  const target = today.endsWith("-01") ? null : daysAgo(1);
  serve([]);
  renderWithProviders(<EmployeeDashboardPage />);

  await screen.findByText("Recent activity");
  if (target) expect(cellFor(target)).toHaveAttribute("data-status", "NO_RECORD");
  expect(cellFor(today)).toHaveAttribute("data-status", "NO_RECORD");
});

it("marks days after today as upcoming", async () => {
  serve([]);
  renderWithProviders(<EmployeeDashboardPage />);

  await screen.findByText("Recent activity");
  const future = document.querySelectorAll('[data-status="FUTURE"]');
  future.forEach((cell) => {
    const label = cell.getAttribute("title") ?? "";
    expect(label).toMatch(/Upcoming$/);
  });
  // Nothing on or before today is upcoming.
  expect(cellFor(today)).not.toHaveAttribute("data-status", "FUTURE");
});

it("lists the latest recorded days, newest first, skipping rest days", async () => {
  serve([
    day(daysAgo(1), { isIncomplete: true, lastClockOut: null }),
    day(daysAgo(2), { status: "REST_DAY", firstClockIn: null, lastClockOut: null, workedMinutes: 0 }),
    day(daysAgo(3)),
    day(daysAgo(4), { status: "ABSENT", firstClockIn: null, lastClockOut: null, workedMinutes: 0 }),
    day(daysAgo(5)),
    day(daysAgo(6)),
  ]);
  renderWithProviders(<EmployeeDashboardPage />);

  const heading = await screen.findByText("Recent activity");
  const card = heading.parentElement as HTMLElement;
  const rows = within(card).getAllByText(/\d{2} \w{3} \d{4}/);
  expect(rows.map((r) => r.textContent)).toEqual([
    titleDate(daysAgo(1)),
    titleDate(daysAgo(3)),
    titleDate(daysAgo(4)),
    titleDate(daysAgo(5)),
  ]);
  expect(within(card).getByText("No clock-out")).toBeInTheDocument();
  expect(within(card).getByText("Absent")).toBeInTheDocument();
});

it("says so when nothing is recorded yet", async () => {
  serve([]);
  renderWithProviders(<EmployeeDashboardPage />);

  expect(await screen.findByText(/Nothing recorded yet/)).toBeInTheDocument();
});

it("offers a retry when the history can't be loaded", async () => {
  serve([], new Error("Network Error"));
  renderWithProviders(<EmployeeDashboardPage />);

  expect(await screen.findByText("Couldn't load your attendance")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument();
});
