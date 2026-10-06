import type { WorkRule } from "@/app/components/dashboard/WorkRuleFormModal";

// Shared by the Time Regulation page and the Super Admin overview's stat
// card, same reasoning as flaggedPunchSamples.ts: there is no WorkRule
// Prisma model yet, so this is the one seed array both screens read from
// rather than each keeping its own copy that can silently drift apart.
export const SAMPLE_WORK_RULES: WorkRule[] = [
  {
    id: "1",
    name: "Standard Corporate",
    startTime: "08:00",
    endTime: "17:00",
    days: "Mon–Fri",
    gracePeriodMinutes: 15,
    breakMinutes: 60,
    overtimeAfterHours: 9,
  },
  {
    id: "2",
    name: "Night Shift (Ops)",
    startTime: "20:00",
    endTime: "05:00",
    days: "Sun–Thu",
    gracePeriodMinutes: 10,
    breakMinutes: 45,
    overtimeAfterHours: 9,
  },
  {
    id: "3",
    name: "Field Team",
    startTime: "07:30",
    endTime: "16:30",
    days: "Mon–Sat",
    gracePeriodMinutes: 20,
    breakMinutes: 60,
    overtimeAfterHours: 8,
  },
];
