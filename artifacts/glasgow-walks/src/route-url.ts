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

export const GOOGLE_MAPS_MOBILE_MAX_WAYPOINTS = 3;
export const GOOGLE_MAPS_MOBILE_MAX_ROUTE_POINTS = GOOGLE_MAPS_MOBILE_MAX_WAYPOINTS + 2;

export interface GoogleMapsRouteSegment {
  points: NavigationPoint[];
  startIndex: number;
  endIndex: number;
  url: string;
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

export function buildGoogleMapsRouteSegments(points: NavigationPoint[]): GoogleMapsRouteSegment[] {
  if (!Array.isArray(points) || points.length <= GOOGLE_MAPS_MOBILE_MAX_ROUTE_POINTS) {
    return [];
  }

  const segments: GoogleMapsRouteSegment[] = [];
  let startIndex = 0;
  while (startIndex < points.length - 1) {
    const endIndex = Math.min(
      startIndex + GOOGLE_MAPS_MOBILE_MAX_ROUTE_POINTS - 1,
      points.length - 1,
    );
    const segmentPoints = points.slice(startIndex, endIndex + 1);
    segments.push({
      points: segmentPoints,
      startIndex,
      endIndex,
      url: buildGoogleMapsUrl(segmentPoints),
    });
    // Reuse the previous segment's destination as the next segment's origin.
    startIndex = endIndex;
  }
  return segments;
}
