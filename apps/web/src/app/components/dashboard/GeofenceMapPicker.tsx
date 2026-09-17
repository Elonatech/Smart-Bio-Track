"use client";

import { useEffect, useRef, useState } from "react";
import { Search, LocateFixed } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { describeGeolocationError } from "@/lib/geo";

// Leaflet's default marker icon references image paths that only resolve
// correctly when Leaflet's own CSS is served from its own directory —
// under a bundler those relative paths break and every marker renders as
// a broken image. The usual fix is importing the PNGs as bundled assets,
// but under this app's Turbopack setup that resolved to something without
// a usable `.src` ("iconUrl not set in Icon options") rather than the
// StaticImageData object Next normally produces for an image import —
// caught immediately by dashboard/error.tsx rather than shipping broken.
//
// Pointing at unpkg instead, pinned to the exact installed Leaflet
// version, sidesteps whatever that import-resolution quirk was entirely:
// it is the same fix recommended for this exact problem across React,
// Vue, and plain-bundler Leaflet setups generally, not a workaround
// specific to this app.
const LEAFLET_VERSION = "1.9.4";
const LEAFLET_CDN = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/images`;

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: `${LEAFLET_CDN}/marker-icon-2x.png`,
  iconUrl: `${LEAFLET_CDN}/marker-icon.png`,
  shadowUrl: `${LEAFLET_CDN}/marker-shadow.png`,
});

interface GeofenceMapPickerProps {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  /** Fired on drag-end and on map click — never fired continuously mid-drag. */
  onPositionChange: (latitude: number, longitude: number) => void;
}

// Real bounds, not arbitrary ones — these are what a latitude/longitude
// value can ever validly be. The form-level Zod schemas enforce this too,
// but this component does not get to assume it is only ever driven by
// them: an out-of-range value (324, 6546 — an easy typo, or from wherever
// else this ends up being used) previously reached Leaflet unfiltered and
// silently panned to nowhere, rendering a blank grey/blue view with no
// error at all. Clamped here so the map itself can never do that, no
// matter what called it.
function clampLatitude(value: number): number {
  return Math.min(90, Math.max(-90, value));
}
function clampLongitude(value: number): number {
  return Math.min(180, Math.max(-180, value));
}

interface GeocodeResult {
  lat: string;
  lon: string;
  display_name: string;
}

// Nominatim — OpenStreetMap's own free geocoder, no API key, same free
// tier as the map tiles themselves. Its usage policy asks for no more
// than one request per second and no heavy automated use; one search per
// manual button click from an admin setting up an office is exactly the
// light, human-triggered use it is meant for. If this app's usage ever
// grows past that, this is the same kind of swap as the tile URL — a
// paid geocoder behind the same function signature, nothing above it
// changes.
async function geocodeOnce(query: string): Promise<GeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Address lookup failed. Try again.");
  }
  const results = (await response.json()) as GeocodeResult[];
  return results[0] ?? null;
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
async function geocodeAddressWithFallback(
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

// Isolates every Leaflet-specific detail behind one small, swappable
// component. OfficeFormModal only ever sees latitude/longitude/radius in,
// a position callback out — it has no idea Leaflet is involved. That is
// deliberate: the team has not settled on Leaflet vs. Google Maps
// long-term (cost, not capability, is the open question), so whichever
// way that lands, only this file's internals need to change. No page,
// form, or validation logic depends on which map library drew the pin.
//
// Built with the plain `leaflet` package rather than react-leaflet:
// react-leaflet re-renders its map through React's tree, which fights
// Leaflet's own imperative DOM management and has a history of breaking
// on new React majors (this app is on React 19). Managing one Leaflet
// instance directly inside a ref + effect sidesteps that entirely, at
// the cost of a little more code here — code nobody outside this file
// ever has to look at.
export function GeofenceMapPicker({
  latitude,
  longitude,
  radiusMeters,
  onPositionChange,
}: GeofenceMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Set only when the fallback had to broaden the search — "found Egbeda,
  // Lagos" after "4 Oluwakemi Street, ..." matched nothing is a materially
  // different result from finding the exact address, and hiding that
  // difference would leave someone thinking the pin is on their actual
  // building when it is only on their neighbourhood.
  const [approximateMatch, setApproximateMatch] = useState<string | null>(null);

  // Searching just calls the same onPositionChange the drag/click handlers
  // already use — the caller updates its lat/lng state, that flows back
  // down as new props, and the "outside sync" effect below moves the pin
  // and pans the map. No separate internal path needed for "how a
  // position got set."
  //
  // Deliberately NOT a <form onSubmit>: this component is always used
  // inside another form (OfficeFormModal, StepOffice), and a <form>
  // nested inside a <form> is invalid HTML — the browser does not run
  // two independent submit handlers, so pressing Enter here silently
  // submitted the OUTER office form instead of triggering a search. The
  // input's own onKeyDown below is what makes Enter work correctly.
  async function handleSearch() {
    const query = searchQuery.trim();
    if (!query) return;

    setIsSearching(true);
    setSearchError(null);
    setApproximateMatch(null);
    try {
      const result = await geocodeAddressWithFallback(query);
      if (!result) {
        setSearchError(
          "No location found, even after trying a broader search. Place the pin manually instead."
        );
        return;
      }
      // matchedQuery is a strict suffix of the original query once commas
      // are normalized — shorter means the fallback had to drop the
      // start of the address to find anything at all.
      if (result.matchedQuery.length < query.length) {
        setApproximateMatch(result.display_name);
      }
      onPositionChange(parseFloat(result.lat), parseFloat(result.lon));
    } catch {
      setSearchError("Address lookup failed. Try again, or place the pin manually.");
    } finally {
      setIsSearching(false);
    }
  }

  const [isLocating, setIsLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  // The actual fix for the address-search's real limitation: geocoding an
  // address only ever gets to whatever precision OSM happened to map that
  // street to, which can be a whole neighbourhood away from a specific
  // building. Reading the DEVICE's own GPS instead — the same API
  // ClockInFlow reads when someone clocks in — sets the office to exactly
  // wherever this browser physically is right now. Setting up an office
  // by standing in it and pressing this button is also just how most
  // people would expect this to work in the first place.
  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setLocateError("This browser does not support location access.");
      return;
    }
    setIsLocating(true);
    setLocateError(null);
    setSearchError(null);
    setApproximateMatch(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onPositionChange(position.coords.latitude, position.coords.longitude);
        setIsLocating(false);
      },
      (error) => {
        setLocateError(describeGeolocationError(error));
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }

  // Reads latitude/longitude/radiusMeters through a ref rather than as
  // effect dependencies, so the map is created exactly once. Recreating
  // the whole Leaflet instance every time a form field changes would
  // reset the user's pan/zoom on every keystroke in the radius input.
  const latestProps = useRef({ latitude, longitude, radiusMeters, onPositionChange });
  latestProps.current = { latitude, longitude, radiusMeters, onPositionChange };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const lat = clampLatitude(latestProps.current.latitude);
    const lng = clampLongitude(latestProps.current.longitude);
    const { radiusMeters: radius } = latestProps.current;

    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: 15,
      scrollWheelZoom: false,
    });
    mapRef.current = map;

    // OpenStreetMap's tile server, free with no API key — see the
    // library-level note above on why this is the one line that would
    // change if the team later moves to a paid tile provider or Google's
    // own tiles. Everything else about this component is unaffected by
    // that decision.
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
    markerRef.current = marker;

    const circle = L.circle([lat, lng], {
      radius: radius,
      color: "#5f86c8",
      fillColor: "#5f86c8",
      fillOpacity: 0.15,
      weight: 2,
    }).addTo(map);
    circleRef.current = circle;

    function moveTo(newLat: number, newLng: number) {
      marker.setLatLng([newLat, newLng]);
      circle.setLatLng([newLat, newLng]);
      latestProps.current.onPositionChange(newLat, newLng);
    }

    marker.on("dragend", () => {
      const position = marker.getLatLng();
      moveTo(position.lat, position.lng);
    });

    // Clicking anywhere on the map relocates the pin — faster than
    // dragging across a long distance, and the more discoverable action
    // for anyone who has not used a map picker before.
    map.on("click", (event: L.LeafletMouseEvent) => {
      moveTo(event.latlng.lat, event.latlng.lng);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // Deliberately empty — see latestProps above for why this only runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keeps the pin in sync when latitude/longitude change from OUTSIDE the
  // map — someone typing directly into the numeric lat/long fields still
  // next to this picker, or switching from "create" to "edit" on a
  // different office. Guarded so a drag-triggered update (which already
  // moved the marker itself, above) doesn't re-center the map under the
  // user's cursor mid-interaction.
  useEffect(() => {
    const marker = markerRef.current;
    const circle = circleRef.current;
    const map = mapRef.current;
    if (!marker || !circle || !map) return;

    const lat = clampLatitude(latitude);
    const lng = clampLongitude(longitude);

    const current = marker.getLatLng();
    if (Math.abs(current.lat - lat) > 1e-9 || Math.abs(current.lng - lng) > 1e-9) {
      marker.setLatLng([lat, lng]);
      circle.setLatLng([lat, lng]);
      map.panTo([lat, lng]);
    }
  }, [latitude, longitude]);

  useEffect(() => {
    circleRef.current?.setRadius(radiusMeters);
  }, [radiusMeters]);

  return (
    <div>
      <div className="mb-2 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                // Stops the keypress from bubbling to the surrounding
                // office form and submitting THAT instead of searching.
                event.preventDefault();
                handleSearch();
              }
            }}
            placeholder="Search an address"
            className="w-full rounded-md border border-neutral/40 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={isSearching}
          className="shrink-0 rounded-md border border-neutral/30 px-3 py-2 text-sm font-medium text-heading hover:bg-neutral/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSearching ? "Searching…" : "Go"}
        </button>
      </div>

      {/* An address search can only ever be as precise as OSM's data for
          that street — this reads the device's actual GPS instead, so
          setting up an office by standing in it is exact rather than
          approximate. The same button also doubles as the fastest way to
          set up a test office you can immediately clock in from. */}
      <button
        type="button"
        onClick={handleUseMyLocation}
        disabled={isLocating}
        className="mb-2 flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:text-neutral disabled:no-underline disabled:cursor-not-allowed"
      >
        <LocateFixed className="h-3.5 w-3.5" strokeWidth={2} />
        {isLocating ? "Getting your location…" : "Use my current location"}
      </button>

      {searchError && <p className="mb-2 text-xs text-alert">{searchError}</p>}
      {locateError && <p className="mb-2 text-xs text-alert">{locateError}</p>}
      {approximateMatch && (
        <p className="mb-2 text-xs text-warning">
          Closest match: {approximateMatch}. Drag the pin to fine-tune the
          exact spot.
        </p>
      )}

      <div
        ref={containerRef}
        className="h-56 w-full overflow-hidden rounded-lg border border-neutral/20"
        // Leaflet needs a concrete pixel size to lay itself out correctly;
        // Tailwind's h-56 above supplies that. role/aria-label because the
        // container itself is otherwise just an unlabeled div to a screen
        // reader — the search box and coordinate inputs remain the
        // accessible way to set a location.
        role="application"
        aria-label="Map for choosing the office location. Use the search box or the latitude and longitude fields to set the location precisely."
      />
    </div>
  );
}
