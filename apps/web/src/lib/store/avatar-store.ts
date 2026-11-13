import { create } from "zustand";

// Holds the signed-in user's profile picture PREVIEW.
//
// There is no avatar column on the User model and no upload endpoint yet, so
// nothing here reaches a server. The picture lives in memory as a blob: URL
// and is gone on refresh — the profile page says so in plain words. Same
// honesty rule as the notification toggles on that page.
//
// Shared through a store (not component state) so the navbar avatar and the
// profile page show the same picture the moment it's chosen.
//
// When the backend lands: replace `setFromFile` with an upload call, read the
// stored URL from /auth/me, and delete this file.

export const AVATAR_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

interface AvatarState {
  // Tagged with the owner's id so a preview never shows on another account
  // if someone signs out and a different user signs in without a refresh.
  userId: string | null;
  url: string | null;
  /** Returns an error message for a rejected file, or null on success. */
  setFromFile: (userId: string, file: File) => string | null;
  clear: () => void;
}

export const useAvatarStore = create<AvatarState>((set, get) => ({
  userId: null,
  url: null,

  setFromFile: (userId, file) => {
    if (!AVATAR_ACCEPTED_TYPES.includes(file.type)) {
      return "Use a JPG, PNG or WebP image.";
    }
    if (file.size > AVATAR_MAX_BYTES) {
      return "That image is over 2 MB. Pick a smaller one.";
    }
    // Free the previous blob — each one holds the whole image in memory.
    const previous = get().url;
    if (previous) URL.revokeObjectURL(previous);
    set({ userId, url: URL.createObjectURL(file) });
    return null;
  },

  clear: () => {
    const previous = get().url;
    if (previous) URL.revokeObjectURL(previous);
    set({ userId: null, url: null });
  },
}));

/** The preview URL for this user, or null. Use this rather than `url` directly. */
export function useAvatarUrl(userId: string | undefined): string | null {
  return useAvatarStore((state) =>
    userId && state.userId === userId ? state.url : null
  );
}
