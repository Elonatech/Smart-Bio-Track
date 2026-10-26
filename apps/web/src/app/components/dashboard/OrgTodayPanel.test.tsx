/**
 * @jest-environment jsdom
 */
import { OrgTodayPanel } from "./OrgTodayPanel";
import { appClient } from "@/lib/api-client";
import { localToday } from "@/lib/orgToday";
import { renderWithProviders, signInAs, screen, waitFor, within } from "@/test/render";
import userEvent from "@testing-library/user-event";

/**
 * The admin overview's "Today across the organisation". The numbers are
 * sample until the summary endpoint exists, and the panel must SAY so. What
 * is real already, and pinned here: the branch filter's options, and the
 * quiet-day states — a holiday, a rest day, and no work rule at all.
 */

jest.mock("@/lib/api-client", () => ({
  appClient: { get: jest.fn() },
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : "Something went wrong",
}));

const mockGet = appClient.get as jest.Mock;

const TZ = "Africa/Lagos";
const { date: TODAY, weekday: TODAY_WEEKDAY } = localToday(new Date(), TZ);
const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];

const RULE = {
  id: "rule-std",
  name: "Standard hours",
  isDefault: true,
  workingDays: EVERY_DAY,
  startTime: "08:00",
  endTime: "17:00",
  gracePeriodMinutes: 10,
  overtimeAfterMinutes: null,
  overtimeMultiplier: 1.5,
  offices: [],
};

function api({
  rules = [RULE] as unknown[],
  offices = [{ id: "o1", name: "Lagos HQ" }, { id: "o2", name: "Abuja" }] as unknown[],
  holidays = [] as unknown[],
} = {}) {
  mockGet.mockImplementation((url: string) => {
    if (url === "/organization") {
      return Promise.resolve({ data: { id: "org-1", name: "Acme", industry: "Retail", timezone: TZ } });
    }
    if (url === "/work-rules") return Promise.resolve({ data: rules });
    if (url === "/offices") return Promise.resolve({ data: offices });
    if (url === "/holidays") return Promise.resolve({ data: holidays });
    return Promise.reject(new Error("unexpected GET " + url));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  signInAs("SUPER_ADMIN");
  api();
});

it("shows who's in out of who's expected, with the four counts", async () => {
  renderWithProviders(<OrgTodayPanel />);

  expect(await screen.findByText(/of \d+ expected are in/)).toBeInTheDocument();
  for (const label of ["Present", "Late", "On break", "Not in yet"]) {
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  }
});

it("says plainly that the figures are sample data", async () => {
  renderWithProviders(<OrgTodayPanel />);

  expect(await screen.findByText("Sample data")).toBeInTheDocument();
});

it("lists late arrivals and who isn't in, three at first, expanding in place", async () => {
  renderWithProviders(<OrgTodayPanel />);
  await screen.findByText(/of \d+ expected are in/);

  const lateList = screen.getByRole("heading", { name: "Late arrivals" }).parentElement as HTMLElement;
  expect(within(lateList).getAllByRole("listitem")).toHaveLength(3);

  await userEvent.click(within(lateList).getByRole("button", { name: /See all/ }));
  expect(within(lateList).getAllByRole("listitem").length).toBeGreaterThan(3);
  expect(within(lateList).getByRole("button", { name: "Show fewer" })).toBeInTheDocument();
});

it("offers the organisation's real branches as a filter, and narrows the numbers", async () => {
  renderWithProviders(<OrgTodayPanel />);
  const headline = await screen.findByText(/of \d+ expected are in/);
  const before = headline.textContent;

  const filter = screen.getByRole("combobox", { name: "Branch" });
  expect(Array.from((filter as HTMLSelectElement).options).map((o) => o.textContent)).toEqual([
    "All branches",
    "Lagos HQ",
    "Abuja",
  ]);

  await userEvent.selectOptions(filter, "o2");
  await waitFor(() => expect(screen.getByText(/of \d+ expected are in/).textContent).not.toBe(before));
});

it("hides the branch filter when there's only one branch", async () => {
  api({ offices: [{ id: "o1", name: "Lagos HQ" }] });
  renderWithProviders(<OrgTodayPanel />);
  await screen.findByText(/of \d+ expected are in/);

  expect(screen.queryByRole("combobox", { name: "Branch" })).not.toBeInTheDocument();
});

it("on a holiday, says nobody is expected instead of showing numbers", async () => {
  api({
    holidays: [{ id: "h1", name: "Independence Day", date: TODAY, onDate: TODAY, type: "PUBLIC", repeatsAnnually: false }],
  });
  renderWithProviders(<OrgTodayPanel />);

  expect(await screen.findByText("Today is Independence Day")).toBeInTheDocument();
  expect(screen.queryByText(/expected are in/)).not.toBeInTheDocument();
});

it("on a rest day, says it isn't a working day", async () => {
  api({ rules: [{ ...RULE, workingDays: EVERY_DAY.filter((d) => d !== TODAY_WEEKDAY) }] });
  renderWithProviders(<OrgTodayPanel />);

  expect(await screen.findByText("Not a working day")).toBeInTheDocument();
});

it("with no work rule, points the Super Admin to Time Regulation", async () => {
  api({ rules: [] });
  renderWithProviders(<OrgTodayPanel />);

  expect(await screen.findByText("No working hours set yet")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Go to Time Regulation" })).toHaveAttribute(
    "href",
    "/dashboard/super-admin/time-regulation"
  );
});

it("doesn't offer HR a link to a Super Admin page", async () => {
  signInAs("HR_ADMIN");
  api({ rules: [] });
  renderWithProviders(<OrgTodayPanel />);

  await screen.findByText("No working hours set yet");
  expect(screen.queryByRole("link", { name: "Go to Time Regulation" })).not.toBeInTheDocument();
});

it("judges a branch by its own rule when it has one", async () => {
  // The default works every day; Abuja's own rule doesn't work today.
  api({
    rules: [RULE, { ...RULE, id: "rule-abj", name: "Abuja hours", isDefault: false, workingDays: EVERY_DAY.filter((d) => d !== TODAY_WEEKDAY) }],
    offices: [{ id: "o1", name: "Lagos HQ" }, { id: "o2", name: "Abuja", workRuleId: "rule-abj" }],
  });
  renderWithProviders(<OrgTodayPanel />);
  await screen.findByText(/of \d+ expected are in/);

  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Branch" }), "o2");

  expect(await screen.findByText("Not a working day")).toBeInTheDocument();
});

it("shows the reason and a retry when it can't load", async () => {
  mockGet.mockRejectedValueOnce(new Error("Network Error"));
  renderWithProviders(<OrgTodayPanel />);

  expect(await screen.findByText(/Network Error/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText(/of \d+ expected are in/)).toBeInTheDocument();
});

it("spins the Refresh icon visibly, even though the sample numbers come back instantly", async () => {
  // Found in testing: the spinner switched off before it could be drawn.
  renderWithProviders(<OrgTodayPanel />);
  await screen.findByText(/of \d+ expected are in/);
  const button = screen.getByRole("button", { name: "Refresh" });

  await userEvent.click(button);

  // Still spinning once the instant refresh has settled…
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(button.querySelector("svg")).toHaveClass("animate-spin");
  // …and stops by itself.
  await waitFor(() => expect(button.querySelector("svg")).not.toHaveClass("animate-spin"));
});
