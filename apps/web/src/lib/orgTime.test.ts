import { formatOrgToday, zoneLabel } from "./orgTime";

// Backend decision 1.1: times show in the organisation's zone. These pin the
// two helpers every page header uses.

describe("zoneLabel", () => {
  it.each([
    ["Africa/Lagos", "Lagos time"],
    ["America/New_York", "New York time"],
    ["Europe/London", "London time"],
  ])("%s → %s", (zone, label) => {
    expect(zoneLabel(zone)).toBe(label);
  });

  it("is empty until the zone is known", () => {
    expect(zoneLabel(undefined)).toBe("");
  });
});

describe("formatOrgToday", () => {
  // 23:30 UTC on 20 Oct is already 21 Oct in Lagos (UTC+1) — the case
  // where the browser's date and the organisation's date disagree.
  const lateEvening = new Date("2026-10-20T23:30:00Z");

  it("uses the organisation's calendar date, not UTC's", () => {
    expect(formatOrgToday("Africa/Lagos", lateEvening)).toBe("Wednesday, 21 October 2026");
    expect(formatOrgToday("UTC", lateEvening)).toBe("Tuesday, 20 October 2026");
  });
});
