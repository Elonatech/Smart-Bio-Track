"use client";

import { getInitials } from "@/lib/initials";
import { useAvatarUrl } from "@/lib/store/avatar-store";

// One avatar for the signed-in user, used by the navbar and the profile
// page: their picture if one is set, initials otherwise.

const SIZES = {
  sm: "h-8 w-8 text-xs",
  lg: "h-24 w-24 text-2xl",
} as const;

interface UserAvatarProps {
  userId: string;
  nameOrEmail: string;
  size?: keyof typeof SIZES;
}

export function UserAvatar({ userId, nameOrEmail, size = "sm" }: UserAvatarProps) {
  const url = useAvatarUrl(userId);
  const sizeClass = SIZES[size];

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- blob: URLs can't go through next/image
      <img
        src={url}
        alt={`${nameOrEmail}'s profile picture`}
        className={`${sizeClass} rounded-full object-cover shrink-0`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${sizeClass} rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold shrink-0`}
    >
      {getInitials(nameOrEmail)}
    </span>
  );
}
