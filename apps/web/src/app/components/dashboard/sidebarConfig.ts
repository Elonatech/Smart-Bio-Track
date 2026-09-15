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
  Network,
  User,
} from "lucide-react";
import type { UserRole } from "@/lib/store/auth-store";
import { getDashboardPath } from "@/lib/roleRoutes";
import type { PlanTier } from "@/lib/planTiers";

export interface SidebarItem {
  label: string;
  href: string;
  icon: LucideIcon;
  // Omitted for anything every plan gets. Set only on the handful of
  // items that map to an actual pricing-page bullet (see Pricing.tsx) —
  // see planTiers.ts for how this gates the item in Sidebar.tsx.
  requiredPlan?: PlanTier;
}


const SUPER_ADMIN_ROOT = getDashboardPath("SUPER_ADMIN");
const HR_ADMIN_ROOT = getDashboardPath("HR_ADMIN");
const TEAM_LEAD_ROOT = getDashboardPath("TEAM_LEAD");
const EMPLOYEE_ROOT = getDashboardPath("EMPLOYEE");

export const SIDEBAR_ITEMS: Record<UserRole, SidebarItem[]> = {
  SUPER_ADMIN: [
    { label: "Overview", href: SUPER_ADMIN_ROOT, icon: LayoutDashboard },
    { label: "Employees", href: `${SUPER_ADMIN_ROOT}/employees`, icon: Users },
    { label: "Departments", href: `${SUPER_ADMIN_ROOT}/departments`, icon: Network, requiredPlan: "CORE" },
    { label: "Offices & Geo-Fences", href: `${SUPER_ADMIN_ROOT}/offices`, icon: Building2 },
    { label: "Time Regulation", href: `${SUPER_ADMIN_ROOT}/time-regulation`, icon: Clock },
    { label: "Holiday Calendar", href: `${SUPER_ADMIN_ROOT}/holidays`, icon: Calendar },
    { label: "Audit Logs", href: `${SUPER_ADMIN_ROOT}/audit-logs`, icon: ClipboardList },
    { label: "Organization Settings", href: `${SUPER_ADMIN_ROOT}/settings`, icon: Settings, requiredPlan: "ENTERPRISE" },
    { label: "Profile", href: `${SUPER_ADMIN_ROOT}/profile`, icon: User },
  ],
  HR_ADMIN: [
    { label: "Overview", href: HR_ADMIN_ROOT, icon: LayoutDashboard },
    { label: "Review Queue", href: `${HR_ADMIN_ROOT}/review`, icon: ClipboardList, requiredPlan: "CORE" },
    { label: "Employees", href: `${HR_ADMIN_ROOT}/employees`, icon: Users },
    { label: "Reports", href: `${HR_ADMIN_ROOT}/reports`, icon: FileText },
    { label: "Payroll Exports", href: `${HR_ADMIN_ROOT}/payroll`, icon: Wallet, requiredPlan: "CORE" },
    { label: "Leave Administration", href: `${HR_ADMIN_ROOT}/leave`, icon: CalendarClock },
    { label: "Profile", href: `${HR_ADMIN_ROOT}/profile`, icon: User },
  ],
  TEAM_LEAD: [
    // The one role whose first item isn't called "Overview": a team
    // lead's overview IS the roster for today, so a separate Overview
    // above it would just be a second page showing the same thing. Still
    // items[0] and still the role's root path, which is all the active-
    // link logic in Sidebar.tsx depends on.
    { label: "Team Today", href: TEAM_LEAD_ROOT, icon: Users },
    { label: "Pending Exceptions", href: `${TEAM_LEAD_ROOT}/exceptions`, icon: AlertTriangle },
    { label: "Department Reports", href: `${TEAM_LEAD_ROOT}/reports`, icon: FileText },
    { label: "Leave Requests", href: `${TEAM_LEAD_ROOT}/leave`, icon: CalendarClock },
    { label: "Profile", href: `${TEAM_LEAD_ROOT}/profile`, icon: User },
  ],
  EMPLOYEE: [
    { label: "Overview", href: EMPLOYEE_ROOT, icon: LayoutDashboard },
    { label: "Attendance History", href: `${EMPLOYEE_ROOT}/attendance`, icon: Clock },
    { label: "Leave Requests", href: `${EMPLOYEE_ROOT}/leave`, icon: CalendarClock },
    { label: "Profile", href: `${EMPLOYEE_ROOT}/profile`, icon: User },
  ],
  // No dedicated Platform Admin dashboard yet — same fallback as
  // roleRoutes.ts, just Super Admin's items for now.
  PLATFORM_ADMIN: [
    { label: "Overview", href: SUPER_ADMIN_ROOT, icon: LayoutDashboard },
    { label: "Offices & Geo-Fences", href: `${SUPER_ADMIN_ROOT}/offices`, icon: Building2 },
    { label: "Time Regulation", href: `${SUPER_ADMIN_ROOT}/time-regulation`, icon: Clock },
    { label: "Holiday Calendar", href: `${SUPER_ADMIN_ROOT}/holidays`, icon: Calendar },
    { label: "Audit Logs", href: `${SUPER_ADMIN_ROOT}/audit-logs`, icon: ClipboardList },
    { label: "Organization Settings", href: `${SUPER_ADMIN_ROOT}/settings`, icon: Settings, requiredPlan: "ENTERPRISE" },
    { label: "Profile", href: `${SUPER_ADMIN_ROOT}/profile`, icon: User },
  ],
};
