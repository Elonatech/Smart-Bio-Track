import { formatHours, formatWorkingDays } from "./workRules";

describe("formatWorkingDays", () => {
  it.each([
    [[1, 2, 3, 4, 5], "Mon–Fri"],
    [[1, 2, 3, 4, 5, 6, 7], "Every day"],
    [[1, 3, 5], "Mon, Wed, Fri"],
    [[6, 7], "Sat, Sun"],
    [[1, 2, 3, 6, 7], "Mon–Wed, Sat, Sun"],
    [[5, 1, 3, 2, 4], "Mon–Fri"],
    [[], "No days"],
  ])("%j → %s", (days, expected) => {
    expect(formatWorkingDays(days)).toBe(expected);
  });
});

describe("formatHours", () => {
  it("shows whole and half hours without trailing zeros", () => {
    expect(formatHours(480)).toBe("8 h");
    expect(formatHours(450)).toBe("7.5 h");
  });
});
