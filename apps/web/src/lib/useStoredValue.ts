import { useCallback, useSyncExternalStore } from "react";

// Reads a value from localStorage or sessionStorage without the
// "useState(false) + useEffect(() => setX(storage…))" pattern React's lint
// rule flags.
//
// useSyncExternalStore is React's own tool for "a value that lives outside
// React". On the server (and the first client render, so the HTML matches)
// it uses `null`; straight after, it reads the real value. Writing through
// the returned setter tells every component reading the same key, so two
// parts of the screen can't disagree.
//
// Storage can throw (private browsing, blocked site data). Then the value is
// kept in memory instead, so it still works for this page view.

type Area = "local" | "session";

const CHANGE_EVENT = "stored-value-change";

// Fallback for when storage refuses a write; keyed "area:key".
const memory = new Map<string, string>();

function storageFor(area: Area): Storage | null {
  try {
    return area === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  // "storage" fires for changes made in other tabs; our own event covers
  // changes made in this tab.
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

const serverSnapshot = () => null;

export function useStoredValue(
  area: Area,
  key: string
): [string | null, (value: string) => void] {
  const read = useCallback(() => {
    const kept = memory.get(`${area}:${key}`);
    if (kept !== undefined) return kept;
    try {
      return storageFor(area)?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }, [area, key]);

  const value = useSyncExternalStore(subscribe, read, serverSnapshot);

  const write = useCallback(
    (next: string) => {
      try {
        const storage = storageFor(area);
        if (!storage) throw new Error("no storage");
        storage.setItem(key, next);
      } catch {
        memory.set(`${area}:${key}`, next);
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [area, key]
  );

  return [value, write];
}
