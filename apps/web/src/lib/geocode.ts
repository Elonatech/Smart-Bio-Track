// Nominatim — OpenStreetMap's own free geocoder, no API key, same free
// tier as the map tiles GeofenceMapPicker draws. Its usage policy asks for
// no more than one request per second and no heavy automated use; one
// lookup per manual action (a button click, an Enter key press) is
// exactly the light, human-triggered use it is meant for.
//
// Pulled out of GeofenceMapPicker.tsx so a second address input elsewhere
// on the same form (StepOffice.tsx's own "Address" field, separate from
// the map's internal search box) can trigger the identical lookup instead
// of re-implementing it, or worse, silently doing something different
// under a field that looks like it does the same thing.

export interface GeocodeResult {
  lat: string;
  lon: string;
  display_name: string;
}

export async function geocodeOnce(query: string): Promise<GeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Address lookup failed. Try again.");
  }
  const results = (await response.json()) as GeocodeResult[];
  return results[0] ?? null;
}

// The other direction of the same lookup: coordinates in, a human-readable
// address out.
export async function reverseGeocodeOnce(lat: number, lon: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const result = (await response.json()) as { display_name?: string };
  return result.display_name ?? null;
}

/**
 * Falls back to a broader search when the exact address has no match —
 * OSM's coverage of individual residential streets in less-mapped areas
 * is genuinely incomplete (confirmed directly: "4 Oluwakemi Street,
 * Shasha Road, Egbeda, Lagos" has no OSM data at all, but "Shasha Road,
 * Egbeda, Lagos" does). Rather than a flat "not found", this tries again
 * one comma-separated segment at a time — house number/street first,
 * then street, then area — which is exactly what a person would do by
 * hand. `matchedQuery` on the result tells the caller how much of the
 * original address it actually matched, so "closest match" can say what
 * it means instead of implying it found the exact address.
 */
export async function geocodeAddressWithFallback(
  query: string
): Promise<(GeocodeResult & { matchedQuery: string }) | null> {
  const segments = query
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Stops at 2 segments remaining (e.g. "Lagos, Nigeria") rather than
  // falling all the way to a single country name, which would place the
  // pin somewhere so broad it is worse than just saying nothing matched.
  // Math.max(0, ...) guarantees at least one attempt even for a query
  // with fewer than 2 segments (a single word, or no commas at all) —
  // without it, `segments.length - 2` goes negative and the loop below
  // never runs even once.
  const lastStart = Math.max(0, segments.length - 2);
  for (let start = 0; start <= lastStart; start++) {
    const candidate = segments.slice(start).join(", ");
    const result = await geocodeOnce(candidate);
    if (result) {
      return { ...result, matchedQuery: candidate };
    }
  }
  return null;
}
