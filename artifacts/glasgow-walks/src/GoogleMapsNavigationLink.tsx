import type { MouseEvent as ReactMouseEvent } from 'react';
import { Navigation } from 'lucide-react';
import {
  GOOGLE_MAPS_DESKTOP_MAX_WAYPOINTS,
  GOOGLE_MAPS_MOBILE_MAX_WAYPOINTS,
  buildGoogleMapsRouteSegments,
  buildGoogleMapsUrl,
  type NavigationPoint,
} from './route-url';
import { getPosition } from './browser-helpers';

type Props = {
  points: NavigationPoint[];
  testId: string;
};

function pointLabel(point: NavigationPoint, index: number, lastIndex: number): string {
  const name = point.name?.trim();
  if (name) return name;
  if (index === 0) return 'Starting point';
  if (index === lastIndex) return 'Final stop';
  return `Stop ${index}`;
}

function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const browserNavigator = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  return browserNavigator.userAgentData?.mobile === true
    || /android|iphone|ipad|ipod|mobile/i.test(browserNavigator.userAgent)
    || (browserNavigator.platform === 'MacIntel' && browserNavigator.maxTouchPoints > 1);
}

export default function GoogleMapsNavigationLink({ points, testId }: Props) {
  const mobile = isMobileDevice();
  const maxWaypoints = mobile
    ? GOOGLE_MAPS_MOBILE_MAX_WAYPOINTS
    : GOOGLE_MAPS_DESKTOP_MAX_WAYPOINTS;
  const href = points.length >= 2 && points.length <= maxWaypoints + 2
    ? buildGoogleMapsUrl(points)
    : '';
  const segments = buildGoogleMapsRouteSegments(points, maxWaypoints);
  const content = (
    <>
      <Navigation size={15} aria-hidden="true" />
      Directions
    </>
  );

  return (
    <div className="google-maps-navigation">
      {href ? (
        <a
          className="button-secondary navigation-button"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={testId}
          aria-label="Open walk in Google Maps"
        >
          {content}
        </a>
      ) : points.length < 2 ? (
        <button
          type="button"
          className="button-secondary navigation-button"
          disabled
          data-testid={testId}
          aria-label="Open walk in Google Maps"
        >
          {content}
        </button>
      ) : null}
      {segments.length > 0 && (
        <nav className="google-maps-route-segments" aria-label="Google Maps route parts" data-testid={`${testId}-segments`}>
          <p>This route is split to fit Google Maps. Open each part in order; each starts where the last ends.</p>
          <ol>
            {segments.map((segment, index) => {
              const start = pointLabel(segment.points[0], segment.startIndex, points.length - 1);
              const end = pointLabel(segment.points[segment.points.length - 1], segment.endIndex, points.length - 1);
              return (
                <li key={`${segment.startIndex}-${segment.endIndex}`}>
                  <a
                    href={segment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`${testId}-segment-${index + 1}`}
                    aria-label={`Open Google Maps part ${index + 1} of ${segments.length}: ${start} to ${end}`}
                  >
                    <span>Part {index + 1} of {segments.length}</span>
                    <span>{start} → {end}</span>
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>
      )}
    </div>
  );
}
