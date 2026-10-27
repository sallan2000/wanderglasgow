// Builds a cross-platform Google Maps directions URL from ordered places.
// Named attractions are searched by name instead of coordinates, which can
// resolve to an unrelated nearby business.

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

export function buildGoogleMapsUrl(points: NavigationPoint[]): string {
  if (!Array.isArray(points) || points.length < 2) {
    return '';
  }

  const origin = formatNavigationPoint(points[0]);
  const destination = formatNavigationPoint(points[points.length - 1]);
  const waypoints = points.slice(1, -1).map(formatNavigationPoint);

  const googleParams = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'walking',
  });
  if (waypoints.length > 0) {
    googleParams.set('waypoints', waypoints.join('|'));
  }
  return `https://www.google.com/maps/dir/?${googleParams.toString()}`;
}
