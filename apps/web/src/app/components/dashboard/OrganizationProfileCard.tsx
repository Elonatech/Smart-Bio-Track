"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/app/components/Toast";
import { extractErrorMessage } from "@/lib/api-client";
import { INDUSTRIES } from "@/lib/industries";
import { useAuthStore } from "@/lib/store/auth-store";
import {
  TIMEZONES,
  fetchOrganization,
  normalizeTimezone,
  updateOrganization,
  type Organization,
} from "@/lib/organization";

// The organization's own profile — the one real part of Organization
// Settings in Phase 3 (GET/PATCH /organization). Super Admin only on the
// server; this page is Super Admin only too.
//
// Limits match UpdateOrganizationDto. The timezone matters most: it decides
// which calendar day every future punch belongs to and what "08:00" means
// for lateness — past punches keep the day they were recorded on.

const schema = z.object({
  name: z.string().trim().min(2, { message: "Name is required" }).max(120),
  industry: z.string().min(2, { message: "Choose an industry" }).max(80),
  timezone: z.string().min(1),
});
type Values = z.infer<typeof schema>;

const inputClass =
  "w-full rounded-md border border-neutral/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

export function OrganizationProfileCard() {
  const toast = useToast();
  const [org, setOrg] = useState<Organization | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty, dirtyFields },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    let isActive = true;
    fetchOrganization()
      .then((data) => {
        if (!isActive) return;
        setOrg(data);
        setLoadError(null);
        reset({
          name: data.name,
          industry: data.industry ?? "",
          timezone: normalizeTimezone(data.timezone),
        });
      })
      .catch((error) => {
        if (isActive) setLoadError(extractErrorMessage(error));
      });
    return () => {
      isActive = false;
    };
  }, [reset, reloadKey]);

  const onSubmit = async (values: Values) => {
    setSaveError(null);
    try {
      // Only what changed — the audit entry then names exactly that.
      const saved = await updateOrganization({
        ...(dirtyFields.name ? { name: values.name } : {}),
        ...(dirtyFields.industry ? { industry: values.industry } : {}),
        ...(dirtyFields.timezone ? { timezone: values.timezone } : {}),
      });
      setOrg(saved);
      reset({
        name: saved.name,
        industry: saved.industry ?? "",
        timezone: normalizeTimezone(saved.timezone),
      });
      // The sidebar and header read the name from the session.
      useAuthStore.setState((state) =>
        state.user ? { user: { ...state.user, organizationName: saved.name } } : state
      );
      toast.success("Organization updated", "Changes are recorded in the audit log.");
    } catch (error) {
      setSaveError(extractErrorMessage(error));
    }
  };

  // A saved industry or zone that isn't in today's lists stays selectable,
  // so loading the form never silently swaps it for something else.
  const industryOptions =
    org?.industry && !(INDUSTRIES as readonly string[]).includes(org.industry)
      ? [org.industry, ...INDUSTRIES]
      : INDUSTRIES;
  const zoneOptions =
    org && !TIMEZONES.some((z) => z.value === org.timezone)
      ? [{ value: org.timezone, label: org.timezone }, ...TIMEZONES]
      : TIMEZONES;

  return (
    <div className="lg:col-span-2 bg-surface border border-neutral/20 rounded-xl p-5">
      <h2 className="text-base font-semibold text-heading">Organization profile</h2>
      <p className="text-sm text-neutral mt-1 mb-4">
        Your organization&apos;s name, industry and time zone.
      </p>

      {loadError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-alert/30 bg-alert/10 px-4 py-3">
          <p className="min-w-0 text-sm text-alert wrap-break-word">
            Couldn&apos;t load your organization: {loadError}
          </p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="inline-flex items-center gap-2 text-sm font-medium text-heading hover:underline"
          >
            <RefreshCw className="h-4 w-4" strokeWidth={2} />
            Try again
          </button>
        </div>
      ) : !org ? (
        <p className="text-sm text-neutral">Loading…</p>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          {saveError && (
            <div className="mb-4 rounded-md bg-alert/10 border border-alert/30 text-alert text-sm px-3 py-2 wrap-break-word">
              {saveError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="org-name" className="block text-sm font-medium text-heading mb-1">
                Organization name
              </label>
              <input id="org-name" type="text" {...register("name")} className={inputClass} />
              {errors.name && <p className="mt-1 text-sm text-alert">{errors.name.message}</p>}
            </div>

            <div>
              <label htmlFor="org-industry" className="block text-sm font-medium text-heading mb-1">
                Industry
              </label>
              <select id="org-industry" {...register("industry")} className={inputClass}>
                <option value="" disabled>
                  Select industry
                </option>
                {industryOptions.map((industry) => (
                  <option key={industry} value={industry}>
                    {industry}
                  </option>
                ))}
              </select>
              {errors.industry && (
                <p className="mt-1 text-sm text-alert">{errors.industry.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="org-timezone" className="block text-sm font-medium text-heading mb-1">
                Time zone
              </label>
              <select id="org-timezone" {...register("timezone")} className={inputClass}>
                {zoneOptions.map((zone) => (
                  <option key={zone.value} value={zone.value}>
                    {zone.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {dirtyFields.timezone && (
            <p role="status" className="mt-3 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
              Changing the time zone changes which day future clock-ins count for, and what
              start times like 08:00 mean for lateness. Past days stay as they were recorded.
            </p>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={!isDirty || isSubmitting}
              className="rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
