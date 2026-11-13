import { appClient } from "@/lib/api-client";

// The organisation's holiday calendar (apps/api/src/holidays, Phase 3).
// Anyone signed in can read it; Super Admin and HR Admin can change it.
// A holiday is never a day anyone is late or absent on.
//
// Shapes mirror holidays.service.ts `present()` and CreateHolidayDto.

export type HolidayType = "PUBLIC" | "COMPANY";

export interface Holiday {
  id: string;
  name: string;
  /** As stored, "YYYY-MM-DD". For an annual holiday, the year it was entered. */
  date: string;
  type: HolidayType;
  /** Same month and day every year (New Year's Day). False for moveable ones. */
  repeatsAnnually: boolean;
  /**
   * Where it falls in the requested year — equals `date` unless it repeats.
   * This is the date to SHOW; `date` is the one to edit.
   */
  onDate: string;
}

export interface HolidayInput {
  name: string;
  date: string;
  type: HolidayType;
  repeatsAnnually: boolean;
}

/** The holidays in `year`: dated in it, plus every annual one, sorted by onDate. */
export async function fetchHolidays(year: number): Promise<Holiday[]> {
  const { data } = await appClient.get<Holiday[]>("/holidays", { params: { year } });
  return data;
}

export async function createHoliday(input: HolidayInput): Promise<void> {
  await appClient.post("/holidays", input);
}

export async function updateHoliday(id: string, input: Partial<HolidayInput>): Promise<void> {
  await appClient.patch(`/holidays/${id}`, input);
}

export async function deleteHoliday(id: string): Promise<void> {
  await appClient.delete(`/holidays/${id}`);
}

/**
 * "1 Oct 2026". The date is a calendar day in the organisation's zone, not an
 * instant — formatted as UTC so no viewer's timezone can move it a day.
 */
export function formatHolidayDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
