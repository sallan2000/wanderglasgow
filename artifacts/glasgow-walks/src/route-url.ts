// Builds directions URLs from ordered places. Named attractions are searched by
// name instead of coordinates, which can resolve to an unrelated nearby business.
// Entry 0 is the origin; entries 1..n-1 are destinations and waypoints in order.
// Apple Maps:  /directions?source=&destination=&waypoint=...&waypoint=...&mode=walking
// Google Maps: /dir/?api=1&origin=&destination=&waypoints=...&travelmode=walking

export interface Coordinate {
  lat: number;
  lon: number;
}

export interface NavigationPoint extends Coordinate {
  name?: string;
}

function formatCoordinate(point: Coordinate): string {
  return `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`;
}

function formatNavigationPoint(point: NavigationPoint): string {
  return point.name?.trim() || formatCoordinate(point);
}

export interface NavigationUrls {
  appleMapsUrl: string;
  googleMapsUrl: string;
}

export function buildNavigationUrls(points: NavigationPoint[]): NavigationUrls {
  if (!Array.isArray(points) || points.length < 2) {
    return { appleMapsUrl: '', googleMapsUrl: '' };
  }

  const origin = formatNavigationPoint(points[0]);
  const destination = formatNavigationPoint(points[points.length - 1]);
  const waypoints = points.slice(1, -1).map(formatNavigationPoint);

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
