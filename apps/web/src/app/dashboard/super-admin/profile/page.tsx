"use client";

import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import { ProfilePageContent } from "@/app/components/dashboard/ProfilePageContent";

// Every role gets the same profile screen — see ProfilePageContent.
export default function ProfilePage() {
  usePageHeader("Profile", "Your account, devices and notification settings");
  return <ProfilePageContent />;
}
