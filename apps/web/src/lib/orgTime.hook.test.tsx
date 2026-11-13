/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { appClient } from "@/lib/api-client";
import { resetOrgTimeZoneCache, setOrgTimeZone, useOrgTimeZone, zoneLabel } from "./orgTime";
import { render, screen, signInAs } from "@/test/render";

/**
 * The organisation's zone is fetched once and shared. Reported bug: after
 * changing it to New York in Settings, other screens kept showing Lagos until
 * a full refresh, because they all held the cached answer. Saving now
 * replaces the cache and tells every screen showing a time.
 */

jest.mock("@/lib/api-client", () => ({
  appClient: { get: jest.fn() },
  extractErrorMessage: (err: unknown) => (err instanceof Error ? err.message : "error"),
}));

const mockGet = appClient.get as jest.Mock;

function ZoneShown() {
  return <p>{zoneLabel(useOrgTimeZone()) || "loading"}</p>;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetOrgTimeZoneCache();
  signInAs("SUPER_ADMIN", { organizationId: "org-1" });
  mockGet.mockResolvedValue({
    data: { id: "org-1", name: "Acme", industry: "Retail", timezone: "Africa/Lagos" },
  });
});

it("asks the server once and shares the answer", async () => {
  render(
    <>
      <ZoneShown />
      <ZoneShown />
    </>
  );

  expect(await screen.findAllByText("Lagos time")).toHaveLength(2);
  expect(mockGet).toHaveBeenCalledTimes(1);
});

it("switches every screen to a newly saved zone without a refresh", async () => {
  render(<ZoneShown />);
  await screen.findByText("Lagos time");

  act(() => setOrgTimeZone("org-1", "America/New_York"));

  expect(await screen.findByText("New York time")).toBeInTheDocument();
});

it("uses the saved zone for screens opened afterwards too, with no new request", async () => {
  setOrgTimeZone("org-1", "America/New_York");

  render(<ZoneShown />);

  expect(await screen.findByText("New York time")).toBeInTheDocument();
  expect(mockGet).not.toHaveBeenCalled();
});
