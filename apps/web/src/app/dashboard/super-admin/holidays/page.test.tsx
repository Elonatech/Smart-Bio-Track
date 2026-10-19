/**
 * @jest-environment jsdom
 */
import HolidaysPage from "./page";
import { appClient } from "@/lib/api-client";
import { renderWithProviders, signInAs, screen, waitFor, within } from "@/test/render";
import userEvent from "@testing-library/user-event";

/**
 * The holiday calendar on the real /holidays API. Worth pinning: it asks for
 * one year at a time and shows annual holidays on THAT year's date (onDate),
 * edits send the stored date rather than the displayed one, and the server's
 * refusals reach the form in its own words.
 */

jest.mock("@/lib/api-client", () => ({
  appClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
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
const mockPatch = appClient.patch as jest.Mock;
const mockDelete = appClient.delete as jest.Mock;

const THIS_YEAR = new Date().getFullYear();

// Entered in 2024, repeats — so it shows on this year's 1 October.
const INDEPENDENCE = {
  id: "h1",
  name: "Independence Day",
  date: "2024-10-01",
  type: "PUBLIC",
  repeatsAnnually: true,
  onDate: `${THIS_YEAR}-10-01`,
};
const CLOSURE = {
  id: "h2",
  name: "Company closure",
  date: `${THIS_YEAR}-12-24`,
  type: "COMPANY",
  repeatsAnnually: false,
  onDate: `${THIS_YEAR}-12-24`,
};

beforeEach(() => {
  jest.clearAllMocks();
  signInAs("SUPER_ADMIN");
  mockGet.mockResolvedValue({ data: [INDEPENDENCE, CLOSURE] });
  mockPost.mockResolvedValue({ data: {} });
  mockPatch.mockResolvedValue({ data: {} });
  mockDelete.mockResolvedValue({ data: {} });
});

it("asks for this year and shows annual holidays on this year's date", async () => {
  renderWithProviders(<HolidaysPage />);

  expect(await screen.findByText("Independence Day")).toBeInTheDocument();
  expect(mockGet).toHaveBeenCalledWith("/holidays", { params: { year: THIS_YEAR } });
  expect(screen.getByText(`1 Oct ${THIS_YEAR}`)).toBeInTheDocument();
  expect(screen.queryByText("1 Oct 2024")).not.toBeInTheDocument();
  expect(screen.getByText("Repeats yearly")).toBeInTheDocument();
});

it("no longer shows the sample-data banner", async () => {
  renderWithProviders(<HolidaysPage />);
  await screen.findByText("Independence Day");

  expect(screen.queryByText(/sample data/i)).not.toBeInTheDocument();
});

it("moves between years", async () => {
  renderWithProviders(<HolidaysPage />);
  await screen.findByText("Independence Day");

  await userEvent.click(screen.getByRole("button", { name: "Next year" }));

  await waitFor(() =>
    expect(mockGet).toHaveBeenLastCalledWith("/holidays", { params: { year: THIS_YEAR + 1 } })
  );
  await userEvent.click(await screen.findByRole("button", { name: `Back to ${THIS_YEAR}` }));
  await waitFor(() =>
    expect(mockGet).toHaveBeenLastCalledWith("/holidays", { params: { year: THIS_YEAR } })
  );
});

it("says so plainly when a year has none", async () => {
  mockGet.mockResolvedValue({ data: [] });
  renderWithProviders(<HolidaysPage />);

  expect(await screen.findByText(new RegExp(`No holidays in ${THIS_YEAR} yet`))).toBeInTheDocument();
});

it("adds a holiday through the API", async () => {
  renderWithProviders(<HolidaysPage />);
  await screen.findByText("Independence Day");

  await userEvent.click(screen.getByRole("button", { name: /Add holiday/ }));
  const dialog = screen.getByRole("dialog");
  await userEvent.type(within(dialog).getByLabelText(/name/i), "Staff retreat");
  await userEvent.type(within(dialog).getByLabelText(/date/i), `${THIS_YEAR}-11-20`);
  await userEvent.click(within(dialog).getByRole("button", { name: "Save holiday" }));

  await waitFor(() => expect(mockPost).toHaveBeenCalled());
  expect(mockPost).toHaveBeenCalledWith("/holidays", {
    name: "Staff retreat",
    date: `${THIS_YEAR}-11-20`,
    type: "COMPANY",
    repeatsAnnually: false,
  });
});

it("edits with the stored date, not the date shown for this year", async () => {
  renderWithProviders(<HolidaysPage />);
  await screen.findByText("Independence Day");

  await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByLabelText(/date/i)).toHaveValue("2024-10-01");
  await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

  await waitFor(() =>
    expect(mockPatch).toHaveBeenCalledWith("/holidays/h1", expect.objectContaining({ date: "2024-10-01" }))
  );
});

it("keeps the form open with the server's reason when it refuses", async () => {
  mockPost.mockRejectedValueOnce(new Error("A holiday with that name already exists on that date"));
  renderWithProviders(<HolidaysPage />);
  await screen.findByText("Independence Day");

  await userEvent.click(screen.getByRole("button", { name: /Add holiday/ }));
  const dialog = screen.getByRole("dialog");
  await userEvent.type(within(dialog).getByLabelText(/name/i), "Company closure");
  await userEvent.type(within(dialog).getByLabelText(/date/i), `${THIS_YEAR}-12-24`);
  await userEvent.click(within(dialog).getByRole("button", { name: "Save holiday" }));

  expect(
    await within(dialog).findByText("A holiday with that name already exists on that date")
  ).toBeInTheDocument();
});

it("warns that deleting an annual holiday removes it from every year", async () => {
  renderWithProviders(<HolidaysPage />);
  await screen.findByText("Independence Day");

  await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);

  expect(await screen.findByText(/removes it from every year/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Delete holiday" }));
  await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("/holidays/h1"));
});

it("offers a retry when holidays can't load", async () => {
  mockGet.mockRejectedValueOnce(new Error("Network Error")).mockResolvedValue({ data: [CLOSURE] });
  renderWithProviders(<HolidaysPage />);

  await userEvent.click(await screen.findByRole("button", { name: /Try again/ }));

  expect(await screen.findByText("Company closure")).toBeInTheDocument();
});
