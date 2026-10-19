/**
 * @jest-environment jsdom
 */
import TimeRegulationPage from "./page";
import { appClient } from "@/lib/api-client";
import { renderWithProviders, signInAs, screen, waitFor, within } from "@/test/render";
import userEvent from "@testing-library/user-event";

/**
 * Time Regulation on the real /work-rules API. Worth pinning: what the
 * server will refuse is refused here first (deleting the default, an end
 * before the start), what the server does refuse is shown in its words, and
 * the form sends the API's shape — weekday numbers and worked minutes — not
 * the screen's.
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

const STANDARD = {
  id: "rule-std",
  name: "Standard hours",
  isDefault: true,
  workingDays: [1, 2, 3, 4, 5],
  startTime: "08:00",
  endTime: "17:00",
  gracePeriodMinutes: 15,
  overtimeAfterMinutes: 540,
  overtimeMultiplier: 1.5,
  offices: [],
};
const NIGHT = {
  ...STANDARD,
  id: "rule-night",
  name: "Night ops",
  isDefault: false,
  workingDays: [1, 2, 3, 6, 7],
  startTime: "12:00",
  endTime: "20:00",
  overtimeAfterMinutes: null,
  offices: [{ id: "o1", name: "Lagos HQ" }],
};

beforeEach(() => {
  jest.clearAllMocks();
  signInAs("SUPER_ADMIN");
  mockGet.mockResolvedValue({ data: [NIGHT, STANDARD] });
  mockPost.mockResolvedValue({ data: {} });
  mockPatch.mockResolvedValue({ data: {} });
  mockDelete.mockResolvedValue({ data: {} });
});

describe("the list", () => {
  it("shows the server's rules, default first, in plain language", async () => {
    renderWithProviders(<TimeRegulationPage />);

    const names = (await screen.findAllByText(/Standard hours|Night ops/)).map((el) => el.textContent);
    expect(names[0]).toMatch(/Standard hours/);
    expect(screen.getAllByText("Default").length).toBeGreaterThan(0);
    expect(screen.getAllByText("08:00 – 17:00, Mon–Fri").length).toBeGreaterThan(0);
    expect(screen.getAllByText("12:00 – 20:00, Mon–Wed, Sat, Sun").length).toBeGreaterThan(0);
    expect(screen.getAllByText("After 9 h · ×1.5").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not tracked").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Lagos HQ").length).toBeGreaterThan(0);
  });

  it("no longer shows the sample-data banner", async () => {
    renderWithProviders(<TimeRegulationPage />);
    await screen.findAllByText("Night ops");

    expect(screen.queryByText(/sample data/i)).not.toBeInTheDocument();
  });

  it("won't offer to delete the default rule, and says why", async () => {
    renderWithProviders(<TimeRegulationPage />);
    await screen.findAllByText("Standard hours");

    const deletes = screen.getAllByRole("button", { name: "Delete" });
    const disabled = deletes.filter((b) => (b as HTMLButtonElement).disabled);
    expect(disabled.length).toBeGreaterThan(0);
    expect(disabled[0]).toHaveAttribute("title", expect.stringMatching(/default rule/));
  });
});

describe("changing rules", () => {
  it("creates a rule in the API's shape: weekday numbers and worked minutes", async () => {
    renderWithProviders(<TimeRegulationPage />);
    await userEvent.click(await screen.findByRole("button", { name: /New time regulation/ }));

    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Rule name"), "Weekend crew");
    // Default days are Mon–Fri; switch to Sat + Sun only.
    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      await userEvent.click(within(dialog).getByRole("button", { name: day }));
    }
    const hours = within(dialog).getByLabelText("After this many hours worked");
    await userEvent.clear(hours);
    await userEvent.type(hours, "7.5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create rule" }));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost).toHaveBeenCalledWith("/work-rules", {
      name: "Weekend crew",
      workingDays: [6, 7],
      startTime: "08:00",
      endTime: "17:00",
      gracePeriodMinutes: 15,
      overtimeAfterMinutes: 450,
      overtimeMultiplier: 1.5,
    });
  });

  it("refuses an end time before the start, like the server does", async () => {
    renderWithProviders(<TimeRegulationPage />);
    await userEvent.click(await screen.findByRole("button", { name: /New time regulation/ }));

    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Rule name"), "Backwards");
    const end = within(dialog).getByLabelText("End time");
    await userEvent.clear(end);
    await userEvent.type(end, "07:00");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create rule" }));

    expect(await within(dialog).findByText(/End time must be after start time/)).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("keeps the form open with the server's reason when it refuses", async () => {
    mockPost.mockRejectedValueOnce(new Error('A work rule named "Night ops" already exists'));
    renderWithProviders(<TimeRegulationPage />);
    await userEvent.click(await screen.findByRole("button", { name: /New time regulation/ }));

    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Rule name"), "Night ops");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create rule" }));

    expect(
      await within(dialog).findByText('A work rule named "Night ops" already exists')
    ).toBeInTheDocument();
  });

  it("sends turning overtime off as null", async () => {
    renderWithProviders(<TimeRegulationPage />);
    await userEvent.click(await screen.findByRole("button", { name: /New time regulation/ }));

    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Rule name"), "No overtime");
    await userEvent.click(within(dialog).getByLabelText("Track overtime"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Create rule" }));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0][1].overtimeAfterMinutes).toBeNull();
  });

  it("makes another rule the default in one click", async () => {
    renderWithProviders(<TimeRegulationPage />);
    await screen.findAllByText("Night ops");

    await userEvent.click(screen.getAllByRole("button", { name: "Make default" })[0]);

    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith("/work-rules/rule-night", { isDefault: true })
    );
  });

  it("deletes a non-default rule after confirming", async () => {
    renderWithProviders(<TimeRegulationPage />);
    await screen.findAllByText("Night ops");

    const enabledDelete = screen
      .getAllByRole("button", { name: "Delete" })
      .find((b) => !(b as HTMLButtonElement).disabled) as HTMLElement;
    await userEvent.click(enabledDelete);
    await userEvent.click(await screen.findByRole("button", { name: "Delete rule" }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("/work-rules/rule-night"));
  });
});

it("offers a retry when the rules can't load", async () => {
  mockGet.mockRejectedValueOnce(new Error("Network Error")).mockResolvedValue({ data: [STANDARD] });
  renderWithProviders(<TimeRegulationPage />);

  await userEvent.click(await screen.findByRole("button", { name: /Try again/ }));

  expect((await screen.findAllByText("Standard hours")).length).toBeGreaterThan(0);
});


describe("deleting feels instant", () => {
  async function deleteNightOps() {
    renderWithProviders(<TimeRegulationPage />);
    await screen.findAllByText("Night ops");
    const enabledDelete = screen
      .getAllByRole("button", { name: "Delete" })
      .find((b) => !(b as HTMLButtonElement).disabled) as HTMLElement;
    await userEvent.click(enabledDelete);
    await userEvent.click(await screen.findByRole("button", { name: "Delete rule" }));
  }

  it("removes the row before the server answers", async () => {
    mockDelete.mockReturnValueOnce(new Promise(() => {}));
    await deleteNightOps();

    await waitFor(() => expect(screen.queryAllByText("Night ops")).toHaveLength(0));
  });

  it("puts the row back when the server refuses", async () => {
    mockDelete.mockRejectedValueOnce(new Error("Work rule not found"));
    await deleteNightOps();

    expect((await screen.findAllByText("Night ops")).length).toBeGreaterThan(0);
    expect(error).toHaveBeenCalledWith("Couldn't delete this rule", "Work rule not found");
  });
});
