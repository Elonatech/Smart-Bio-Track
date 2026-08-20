"use client";

import { Clock4, LogIn, MapPinned, ShieldAlert, Users } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth-store";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";

export default function SuperAdminDashboardPage() {
  const orgName = useAuthStore((state) => state.user?.organizationName) ?? "Your organization";
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  usePageHeader("Organization overview", `${orgName} · ${today} · WAT`);

  return (
    <div>
      <div className="flex items-start justify-between bg-surface border border-neutral/20 p-5 rounded-xl">
        <div>
          <h5 className="text-xs font-medium tracking-wide uppercase text-neutral border-b border-neutral/30 inline-block pb-0.5">
            Today's status
          </h5>
          <p className="mt-2 text-[18px] font-semibold text-heading">
            Not clocked in yet
          </p>
          <button
            type="button"
            className="mt-6 inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-3 rounded-md hover:bg-primary/90"
          >
            <LogIn className="h-4 w-4" strokeWidth={2} />
            Clock In
          </button>
        </div>

        <div className="text-right">
          <p className="text-2xl font-bold text-heading">00:00:00</p>
          <p className="text-xs text-neutral">
            Working hours today · break 00:00
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="flex gap-3 items-start bg-surface border border-neutral/20 p-5 rounded-xl">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-success/20 mb-3">
            <Users className="h-5 w-5 text-success" strokeWidth={1.75} />
          </div>
          <div className="flex flex-col  items-start">
            <p className="text-xs font-semibold tracking-wide uppercase text-neutral">
              Employees
            </p>
            <p className="mt-1 text-[24px] font-semibold text-heading">203</p>
            <p className="text-[12px] text-neutral">187 active devices</p>
          </div>
        </div>

        {/* Offices */}

        <div className="flex gap-3 items-start bg-surface border border-neutral/20 p-5 rounded-xl">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 mb-3">
            <MapPinned className="h-5 w-5 text-primary" strokeWidth={1.75} />
          </div>
          <div className="flex flex-col  items-start">
            <p className="text-xs font-semibold tracking-wide uppercase text-neutral">
              Offices & geo-fences
            </p>
            <p className="mt-1 text-[24px] font-semibold text-heading">2</p>
            <p className="text-[12px] text-neutral">Lagos HQ, Abuja</p>
          </div>
        </div>

        {/* Work rules */}

        <div className="flex gap-3 items-start bg-surface border border-neutral/20 p-5 rounded-xl">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 mb-3">
            <Clock4 className="h-5 w-5 text-primary" strokeWidth={1.75} />
          </div>
          <div className="flex flex-col  items-start">
            <p className="text-xs font-semibold tracking-wide uppercase text-neutral">
              Work rules
            </p>
            <p className="mt-1 text-[24px] font-semibold text-heading">3</p>
            <p className="text-[12px] text-neutral">Standard, Night, Field</p>
          </div>
        </div>

        {/* Flagged punches */}

        <div className="flex gap-3 items-start bg-surface border border-neutral/20 p-5 rounded-xl">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-warning/15 mb-3">
            <ShieldAlert className="h-5 w-5 text-warning" strokeWidth={2} />
          </div>
          <div className="flex flex-col items-start">
            <p className="text-xs font-semibold tracking-wide uppercase text-neutral">
              Flagged punches (24h)
            </p>
            <p className="mt-1 text-[24px] font-semibold text-heading">4</p>
          </div>
        </div>
      </div>

      {/*  Recent activity*/}

      <div className="bg-surface border border-neutral/20 p-5 rounded-xl mt-6">
        <div>
          <h6 className="text-[15px] font-semibold">Recent activity</h6>
          <p className="text-[12px] text-neutral">
            Configuration and attendance events in your organization
          </p>
        </div>

        <div className="flex flex-col gap-3 mt-6 ">
          <p className="text-[14px] text-neutral">
            Abuja Office geo-fence radius changed from 120 m to 150 m.
          </p>
          <hr className="border-neutral/20" />
          <p className="text-[14px] text-neutral">
            Abuja Office geo-fence radius changed from 120 m to 150 m.
          </p>
          <hr className="border-neutral/20" />
        </div>
      </div>
    </div>
  );
}
