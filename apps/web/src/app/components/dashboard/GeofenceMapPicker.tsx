"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
    <div
      ref={containerRef}
      className="h-56 w-full overflow-hidden rounded-lg border border-neutral/20"
      // Leaflet needs a concrete pixel size to lay itself out correctly;
      // Tailwind's h-56 above supplies that. role/aria-label because the
      // container itself is otherwise just an unlabeled div to a screen
      // reader — the coordinate inputs beside it remain the accessible
      // way to set a location.
      role="application"
      aria-label="Map for choosing the office location. Use the latitude and longitude fields to set the location precisely."
    />
  );
}
