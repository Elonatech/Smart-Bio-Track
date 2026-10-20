/**
 * @jest-environment jsdom
 */
import { OrganizationProfileCard } from "./OrganizationProfileCard";
import { appClient } from "@/lib/api-client";
import { useAuthStore } from "@/lib/store/auth-store";
import { renderWithProviders, signInAs, screen, waitFor } from "@/test/render";
import userEvent from "@testing-library/user-event";

/**
 * The organization profile on the real GET/PATCH /organization. Worth
 * pinning: only changed fields are sent (so the audit entry names exactly
 * what changed), a timezone change is warned about before saving, a rename
 * reaches the sidebar's copy of the name, and refusals are shown.
 */

jest.mock("@/lib/api-client", () => ({
  appClient: { get: jest.fn(), patch: jest.fn() },
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : "Something went wrong",
}));

const success = jest.fn();
jest.mock("@/app/components/Toast", () => ({
  useToast: () => ({ success, error: jest.fn(), info: jest.fn() }),
}));

const mockGet = appClient.get as jest.Mock;
const mockPatch = appClient.patch as jest.Mock;

const ORG = { id: "org-1", name: "Acme Ltd", industry: "Retail", timezone: "Africa/Lagos" };

beforeEach(() => {
  jest.clearAllMocks();
  signInAs("SUPER_ADMIN", { organizationName: "Acme Ltd" });
  mockGet.mockResolvedValue({ data: ORG });
  mockPatch.mockImplementation((_url: string, body: object) =>
    Promise.resolve({ data: { ...ORG, ...body } })
  );
});

it("loads the organization into the form", async () => {
  renderWithProviders(<OrganizationProfileCard />);

  expect(await screen.findByLabelText("Organization name")).toHaveValue("Acme Ltd");
  expect(screen.getByLabelText("Industry")).toHaveValue("Retail");
  expect(screen.getByLabelText("Time zone")).toHaveValue("Africa/Lagos");
  expect(mockGet).toHaveBeenCalledWith("/organization");
});

it("keeps Save disabled until something changes", async () => {
  renderWithProviders(<OrganizationProfileCard />);
  await screen.findByLabelText("Organization name");

  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
});

it("sends only what changed, and updates the name shown in the sidebar", async () => {
  renderWithProviders(<OrganizationProfileCard />);
  const name = await screen.findByLabelText("Organization name");

  await userEvent.clear(name);
  await userEvent.type(name, "Acme Nigeria");
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

  await waitFor(() =>
    expect(mockPatch).toHaveBeenCalledWith("/organization", { name: "Acme Nigeria" })
  );
  await waitFor(() =>
    expect(useAuthStore.getState().user?.organizationName).toBe("Acme Nigeria")
  );
});

it("warns before a time zone change, and sends the IANA name", async () => {
  renderWithProviders(<OrganizationProfileCard />);
  await screen.findByLabelText("Time zone");

  await userEvent.selectOptions(screen.getByLabelText("Time zone"), "Africa/Nairobi");
  expect(screen.getByText(/changes which day future clock-ins count for/)).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(mockPatch).toHaveBeenCalledWith("/organization", { timezone: "Africa/Nairobi" })
  );
});

it("keeps a saved zone that isn't in the list, instead of silently swapping it", async () => {
  mockGet.mockResolvedValue({ data: { ...ORG, timezone: "Pacific/Kiritimati" } });
  renderWithProviders(<OrganizationProfileCard />);

  expect(await screen.findByLabelText("Time zone")).toHaveValue("Pacific/Kiritimati");
});

it("shows the server's reason when it refuses", async () => {
  mockPatch.mockRejectedValueOnce(new Error("timezone must be an IANA zone name, e.g. Africa/Lagos"));
  renderWithProviders(<OrganizationProfileCard />);
  await screen.findByLabelText("Time zone");

  await userEvent.selectOptions(screen.getByLabelText("Time zone"), "Africa/Accra");
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

  expect(
    await screen.findByText("timezone must be an IANA zone name, e.g. Africa/Lagos")
  ).toBeInTheDocument();
});

it("offers a retry when the organization can't load", async () => {
  mockGet.mockRejectedValueOnce(new Error("Network Error")).mockResolvedValue({ data: ORG });
  renderWithProviders(<OrganizationProfileCard />);

  await userEvent.click(await screen.findByRole("button", { name: /Try again/ }));

  expect(await screen.findByLabelText("Organization name")).toHaveValue("Acme Ltd");
});
