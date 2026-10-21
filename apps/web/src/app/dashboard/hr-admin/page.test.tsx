/**
 * @jest-environment jsdom
 */
import HRAdminDashboardPage from "./page";
import { renderWithProviders, signInAs, screen } from "@/test/render";

/**
 * The HR overview's layout: HR's own clock-in card first (HR clocks in like
 * everyone else), then the organisation's day. The four sample tiles that
 * the panel replaced must not come back — two "today" views on one page
 * would show the same numbers twice, and disagree.
 */

jest.mock("@/app/components/dashboard/TodayStatusCard", () => ({
  TodayStatusCard: () => <div>My clock-in card</div>,
}));
jest.mock("@/app/components/dashboard/OrgTodayPanel", () => ({
  OrgTodayPanel: () => <div>Organisation today panel</div>,
}));

beforeEach(() => {
  signInAs("HR_ADMIN");
});

it("shows HR's own clock-in card, then the organisation's day", () => {
  renderWithProviders(<HRAdminDashboardPage />);

  const card = screen.getByText("My clock-in card");
  const panel = screen.getByText("Organisation today panel");
  // Clock-in first.
  expect(card.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("no longer shows the old sample 'today' tiles", () => {
  renderWithProviders(<HRAdminDashboardPage />);

  for (const label of ["Present today", "Late today", "Absent today", "Pending reviews"]) {
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  }
});

it("keeps the review queue shortcut, which carries the pending count", () => {
  renderWithProviders(<HRAdminDashboardPage />);

  expect(screen.getByText("Attendance review queue")).toBeInTheDocument();
  expect(screen.getByText(/flagged punches waiting/)).toBeInTheDocument();
});
