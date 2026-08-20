import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  Users,
  Clock,
  Calendar,
  ClipboardList,
  Settings,
  FileText,
  Wallet,
  CalendarClock,
  AlertTriangle,
  User,
} from "lucide-react";
import type { UserRole } from "@/lib/store/auth-store";
import { getDashboardPath } from "@/lib/roleRoutes";

export interface SidebarItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Every item is nested under the role's own dashboard root (e.g.
// /dashboard/team-lead/exceptions, not a bare /exceptions), so the URL
// structure matches which role's shell you're in. "Overview" is always
// the first item, pointing at the role's own root page — consistent
// across every role rather than Super Admin alone calling it
// "Dashboard". None of these sub-route page.tsx files exist yet (only
// each role's own root page does) — placeholders to build next.
const SUPER_ADMIN_ROOT = getDashboardPath("SUPER_ADMIN");
const HR_ADMIN_ROOT = getDashboardPath("HR_ADMIN");
const TEAM_LEAD_ROOT = getDashboardPath("TEAM_LEAD");
const EMPLOYEE_ROOT = getDashboardPath("EMPLOYEE");

export const SIDEBAR_ITEMS: Record<UserRole, SidebarItem[]> = {
  SUPER_ADMIN: [
    { label: "Overview", href: SUPER_ADMIN_ROOT, icon: LayoutDashboard },
    { label: "Offices & Geo-Fences", href: `${SUPER_ADMIN_ROOT}/offices`, icon: Building2 },
    { label: "Work Rules", href: `${SUPER_ADMIN_ROOT}/work-rules`, icon: Clock },
    { label: "Holiday Calendar", href: `${SUPER_ADMIN_ROOT}/holidays`, icon: Calendar },
    { label: "Audit Logs", href: `${SUPER_ADMIN_ROOT}/audit-logs`, icon: ClipboardList },
    { label: "Organization Settings", href: `${SUPER_ADMIN_ROOT}/settings`, icon: Settings },
  ],
  HR_ADMIN: [
    { label: "Overview", href: HR_ADMIN_ROOT, icon: LayoutDashboard },
    { label: "Review Queue", href: `${HR_ADMIN_ROOT}/review`, icon: ClipboardList },
    { label: "Employees", href: `${HR_ADMIN_ROOT}/employees`, icon: Users },
    { label: "Reports", href: `${HR_ADMIN_ROOT}/reports`, icon: FileText },
    { label: "Payroll Exports", href: `${HR_ADMIN_ROOT}/payroll`, icon: Wallet },
    { label: "Leave Administration", href: `${HR_ADMIN_ROOT}/leave`, icon: CalendarClock },
  ],
  TEAM_LEAD: [
    { label: "Overview", href: TEAM_LEAD_ROOT, icon: LayoutDashboard },
    { label: "Team Today", href: `${TEAM_LEAD_ROOT}/team`, icon: Users },
    { label: "Pending Exceptions", href: `${TEAM_LEAD_ROOT}/exceptions`, icon: AlertTriangle },
    { label: "Department Reports", href: `${TEAM_LEAD_ROOT}/reports`, icon: FileText },
  ],
  EMPLOYEE: [
    { label: "Overview", href: EMPLOYEE_ROOT, icon: LayoutDashboard },
    { label: "Attendance History", href: `${EMPLOYEE_ROOT}/attendance`, icon: Clock },
    { label: "Profile", href: `${EMPLOYEE_ROOT}/profile`, icon: User },
  ],
  // No dedicated Platform Admin dashboard yet — same fallback as
  // roleRoutes.ts, just Super Admin's items for now.
  PLATFORM_ADMIN: [
    { label: "Overview", href: SUPER_ADMIN_ROOT, icon: LayoutDashboard },
    { label: "Offices & Geo-Fences", href: `${SUPER_ADMIN_ROOT}/offices`, icon: Building2 },
    { label: "Work Rules", href: `${SUPER_ADMIN_ROOT}/work-rules`, icon: Clock },
    { label: "Holiday Calendar", href: `${SUPER_ADMIN_ROOT}/holidays`, icon: Calendar },
    { label: "Audit Logs", href: `${SUPER_ADMIN_ROOT}/audit-logs`, icon: ClipboardList },
    { label: "Organization Settings", href: `${SUPER_ADMIN_ROOT}/settings`, icon: Settings },
  ],
};
