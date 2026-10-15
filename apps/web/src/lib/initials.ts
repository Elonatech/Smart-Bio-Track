// Two-letter initials for an avatar: first letters of the first two words
// ("Ada Obi" → "AO"), or the first two characters of a single word or an
// email ("ada@x.com" → "AD"). Shared so every avatar abbreviates alike.
export function getInitials(nameOrEmail: string): string {
  const parts = nameOrEmail.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return nameOrEmail.trim().slice(0, 2).toUpperCase();
}
