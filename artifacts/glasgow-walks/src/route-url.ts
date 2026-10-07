// Builds navigation-app directions URLs from an ordered list of coordinates.
// Entry 0 is the origin (turn-by-turn start); entries 1..n-1 are waypoints in order.
// Apple Maps:  /directions?source=&destination=&waypoint=...&waypoint=...&mode=walking
// Google Maps: /dir/?api=1&origin=&destination=&waypoints=...&travelmode=walking

export interface Coordinate {
  lat: number;
  lon: number;
}

function formatCoordinate(point: Coordinate): string {
  return `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`;
}

export interface NavigationUrls {
  appleMapsUrl: string;
  googleMapsUrl: string;
}

export function buildNavigationUrls(coordinates: { lat: number; lon: number }[]): NavigationUrls {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return { appleMapsUrl: '', googleMapsUrl: '' };
  }

  const origin = formatCoordinate(coordinates[0]);
  const destination = formatCoordinate(coordinates[coordinates.length - 1]);
  const waypoints = coordinates.slice(1, -1).map(formatCoordinate);

  const appleParams = new URLSearchParams({
    saddr: origin,
    daddr: destination,
    dirflg: 'w',
  });
  for (const waypoint of waypoints) {
    appleParams.append('waypoint', waypoint);
  }
  const appleMapsUrl = `https://maps.apple.com/directions?${appleParams.toString()}`;

  const googleParams = new URLSearchParams({
    origin,
    destination,
    travelmode: 'walking',
  });
  if (waypoints.length > 0) {
    googleParams.set('waypoints', waypoints.join('|'));
  }
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&${googleParams.toString()}`;

  return { appleMapsUrl, googleMapsUrl };
}
