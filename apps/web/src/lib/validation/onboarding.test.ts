import { workRulesSchema } from "./onboarding";

// Phase 3 Manual, decision 8: no overnight shifts. The API refuses a rule
// whose end is at or before its start, so the setup wizard's hours step must
// refuse it too — on the step, not as an error on the final screen.
const valid = {
  startTime: "08:00",
  endTime: "17:00",
  gracePeriodMinutes: 15,
  overtimeAfterHours: 17,
  overtimeMultiplier: 1.5,
};

describe("workRulesSchema", () => {
  it("accepts a normal day", () => {
    expect(workRulesSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["an overnight shift", "20:00", "06:00"],
    ["the same start and end", "09:00", "09:00"],
  ])("refuses %s, on the end time field", (_label, startTime, endTime) => {
    const result = workRulesSchema.safeParse({ ...valid, startTime, endTime });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["endTime"]);
    expect(result.error?.issues[0].message).toMatch(/Overnight shifts are not supported/);
  });
});
