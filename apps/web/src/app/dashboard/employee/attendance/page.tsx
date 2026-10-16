"use client";

import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import { MyAttendanceHistory } from "@/app/components/dashboard/MyAttendanceHistory";

// Every role that clocks in gets the same history — see MyAttendanceHistory.
export default function EmployeeAttendancePage() {
  usePageHeader("Attendance history", "Your clock-in and clock-out record");
  return <MyAttendanceHistory />;
}
