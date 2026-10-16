import { timeFromPunches, type Punch } from "./attendance";

/**
 * The status card's timer comes from this, so it has to agree with how the
 * server counts: worked time is clock-in to clock-out minus breaks, and an
 * open interval (still working, still on break) runs to "now".
 */

const at = (time: string) => `2026-10-16T${time}:00.000Z`;
const punch = (type: Punch["type"], time: string): Punch => ({
  id: time,
  type,
  occurredAt: at(time),
});
const now = (time: string) => new Date(at(time));

describe("timeFromPunches", () => {
  it("is zero before any punch", () => {
    expect(timeFromPunches([], now("09:00"))).toEqual({ workedSeconds: 0, breakSeconds: 0 });
  });

  it("counts a shift still in progress up to now", () => {
    const result = timeFromPunches([punch("CLOCK_IN", "08:00")], now("09:30"));
    expect(result.workedSeconds).toBe(90 * 60);
  });

  it("takes breaks out of worked time", () => {
    const result = timeFromPunches(
      [
        punch("CLOCK_IN", "08:00"),
        punch("BREAK_START", "12:00"),
        punch("BREAK_END", "12:30"),
        punch("CLOCK_OUT", "16:30"),
      ],
      now("18:00")
    );
    expect(result).toEqual({ workedSeconds: 8 * 3600, breakSeconds: 30 * 60 });
  });

  it("counts a break still in progress, and stops the work clock during it", () => {
    const result = timeFromPunches(
      [punch("CLOCK_IN", "08:00"), punch("BREAK_START", "12:00")],
      now("12:15")
    );
    expect(result).toEqual({ workedSeconds: 4 * 3600, breakSeconds: 15 * 60 });
  });

  it("freezes after clocking out, however late it gets", () => {
    const punches = [punch("CLOCK_IN", "08:00"), punch("CLOCK_OUT", "16:00")];
    expect(timeFromPunches(punches, now("23:00")).workedSeconds).toBe(8 * 3600);
  });

  it("adds up two shifts in one day", () => {
    const result = timeFromPunches(
      [
        punch("CLOCK_IN", "08:00"),
        punch("CLOCK_OUT", "12:00"),
        punch("CLOCK_IN", "14:00"),
        punch("CLOCK_OUT", "16:00"),
      ],
      now("20:00")
    );
    expect(result.workedSeconds).toBe(6 * 3600);
  });
});
