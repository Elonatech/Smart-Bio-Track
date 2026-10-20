import { appClient } from "@/lib/api-client";

// The organisation's own profile (apps/api/src/organization, Phase 3).
// Anyone signed in may read it; only a Super Admin may change it.

export interface Organization {
  id: string;
  name: string;
  industry: string | null;
  /** IANA zone name — decides which calendar day every punch belongs to. */
  timezone: string;
}

export interface OrganizationUpdate {
  name?: string;
  industry?: string;
  timezone?: string;
}

export async function fetchOrganization(): Promise<Organization> {
  const { data } = await appClient.get<Organization>("/organization");
  return data;
}

export async function updateOrganization(update: OrganizationUpdate): Promise<Organization> {
  const { data } = await appClient.patch<Organization>("/organization", update);
  return data;
}

export const DEFAULT_TIMEZONE = "Africa/Lagos";

/**
 * Time zones offered in onboarding and Settings.
 *
 * VALUES MUST BE IANA NAMES ("Africa/Lagos"), never abbreviations ("WAT"):
 * the API refuses abbreviations, because "WAT" has no daylight-saving or
 * history rules and Node can't resolve it (Phase 3 Manual §8.1). The label
 * can say anything. A short, regional list on purpose — add zones as
 * customers need them, with an IANA value each time.
 */
export const TIMEZONES = [
  { value: "Africa/Lagos", label: "(GMT+1) West Africa Time — Lagos" },
  { value: "Africa/Accra", label: "(GMT+0) Greenwich Mean Time — Accra" },
  { value: "Africa/Abidjan", label: "(GMT+0) Greenwich Mean Time — Abidjan" },
  { value: "Africa/Douala", label: "(GMT+1) West Africa Time — Douala" },
  { value: "Africa/Kinshasa", label: "(GMT+1) West Africa Time — Kinshasa" },
  { value: "Africa/Cairo", label: "(GMT+2) Eastern European Time — Cairo" },
  { value: "Africa/Johannesburg", label: "(GMT+2) South Africa Time — Johannesburg" },
  { value: "Africa/Kigali", label: "(GMT+2) Central Africa Time — Kigali" },
  { value: "Africa/Nairobi", label: "(GMT+3) East Africa Time — Nairobi" },
  { value: "Europe/London", label: "(GMT+0/+1) UK Time — London" },
  { value: "America/New_York", label: "(GMT−5/−4) Eastern Time — New York" },
  { value: "Asia/Dubai", label: "(GMT+4) Gulf Time — Dubai" },
] as const;

/** Older saved onboarding progress may still hold "WAT". */
export function normalizeTimezone(value: string | null | undefined): string {
  if (!value || value === "WAT") return DEFAULT_TIMEZONE;
  return value;
}
