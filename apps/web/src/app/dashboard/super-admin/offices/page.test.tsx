/**
 * @jest-environment jsdom
 */
import OfficesPage from "./page";
import { appClient } from "@/lib/api-client";
import { renderWithProviders, signInAs, screen, waitFor } from "@/test/render";
import userEvent from "@testing-library/user-event";

/**
 * The Branches page reads /offices through the shared cache. Worth pinning:
 * it shows the server's list, says plainly when it can't load, and reads the
 * list again after a branch is deleted, so the card disappears.
 */

jest.mock("@/lib/api-client", () => ({
  appClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : "Something went wrong",
}));

const mockGet = appClient.get as jest.Mock;
const mockDelete = appClient.delete as jest.Mock;

const RULES = [
  { id: "rule-std", name: "Standard hours", isDefault: true },
  { id: "rule-night", name: "Night ops", isDefault: false },
];

function serve(offices: unknown[], rules: unknown = RULES) {
  mockGet.mockImplementation((url: string) => {
    if (url === "/work-rules") {
      return rules instanceof Error ? Promise.reject(rules) : Promise.resolve({ data: rules });
    }
    return Promise.resolve({ data: offices });
  });
}

const LAGOS = {
  id: "o1",
  name: "Lagos HQ",
  latitude: 6.5244,
  longitude: 3.3792,
  geofenceRadiusMeters: 150,
  workRuleId: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  signInAs("SUPER_ADMIN");
  serve([LAGOS]);
  mockDelete.mockResolvedValue({ data: {} });
});

it("shows the server's branches", async () => {
  renderWithProviders(<OfficesPage />);

  expect((await screen.findAllByText("Lagos HQ")).length).toBeGreaterThan(0);
  expect(screen.getByText(/6\.5244° N, 3\.3792° E · radius 150 m/)).toBeInTheDocument();
});

it("offers the first-branch hint when there are none", async () => {
  serve([]);
  renderWithProviders(<OfficesPage />);

  expect(await screen.findByText(/No branches yet/)).toBeInTheDocument();
});

it("says so when the list can't load", async () => {
  mockGet.mockRejectedValue(new Error("Network Error"));
  renderWithProviders(<OfficesPage />);

  expect(await screen.findByText("Couldn't load branches. Please try again.")).toBeInTheDocument();
});

it("reads the list again after a delete, so the branch disappears", async () => {
  renderWithProviders(<OfficesPage />);
  await screen.findAllByText("Lagos HQ");
  serve([]);

  await userEvent.click(screen.getByRole("button", { name: "Delete" }));
  const dialog = await screen.findByRole("dialog");
  const confirm = Array.from(dialog.querySelectorAll("button")).find((b) =>
    /delete/i.test(b.textContent ?? "")
  ) as HTMLElement;
  await userEvent.click(confirm);

  await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("/offices/o1"));
  expect(await screen.findByText(/No branches yet/)).toBeInTheDocument();
});

describe("which hours each branch follows", () => {
  it("names the branch's own rule", async () => {
    serve([{ ...LAGOS, workRuleId: "rule-night" }]);
    renderWithProviders(<OfficesPage />);

    expect(await screen.findByText("Night ops")).toBeInTheDocument();
  });

  it("names the organisation's default when the branch has none", async () => {
    renderWithProviders(<OfficesPage />);

    expect(await screen.findByText("Standard hours (default)")).toBeInTheDocument();
  });

  it("says so when no rule exists at all", async () => {
    serve([LAGOS], []);
    renderWithProviders(<OfficesPage />);

    expect(await screen.findByText("No work rule yet")).toBeInTheDocument();
  });

  it("leaves the line out, rather than guessing, if the rules can't load", async () => {
    serve([LAGOS], new Error("Network Error"));
    renderWithProviders(<OfficesPage />);
    await screen.findAllByText("Lagos HQ");

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/work-rules"));
    expect(screen.queryByText(/^Hours:/)).not.toBeInTheDocument();
  });
});
