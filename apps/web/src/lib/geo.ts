// Great-circle distance between two coordinates, in metres. Standard
// haversine formula — used to check how far a clock-in attempt is from an
// office's centre point, against that office's geofenceRadiusMeters.
const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function distanceInMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLng = toRadians(b.longitude - a.longitude);

  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/** "48 m", "1.2 km", "526 km" — a geo-fence miss is almost always a few
 * hundred metres, but someone testing from the wrong city entirely
 * shouldn't see "525898 m". */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

// Shared by ClockInFlow (reading where someone is) and GeofenceMapPicker's
// "Use my location" button (setting where an office is) — both call
// navigator.geolocation.getCurrentPosition and both need the same
// readable, specific reasons rather than the browser's own terse
// GeolocationPositionError. Someone who denied the permission prompt by
// reflex needs to be told how to fix it, not just that it failed.
export function describeGeolocationError(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location access was denied. Enable it for this site in your browser settings and try again.";
    case error.POSITION_UNAVAILABLE:
      return "Your device could not determine a location. Try moving somewhere with a clearer GPS or network signal.";
    case error.TIMEOUT:
      return "Getting your location took too long. Check your connection and try again.";
    default:
      return "Could not get your location.";
  }
}
