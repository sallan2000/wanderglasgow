import type { MouseEvent as ReactMouseEvent } from 'react';
import { Navigation } from 'lucide-react';
import {
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

export default function GoogleMapsNavigationLink({ points, testId }: Props) {
  const openInGoogleMaps = async (event: ReactMouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    try {
      const position = await getPosition();
      const location: NavigationPoint = {
        lat: position.lat,
        lon: position.lon,
      };
      const url = buildGoogleMapsUrl([location, ...points]);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      window.open(buildGoogleMapsUrl(points), '_blank', 'noopener,noreferrer');
    }
  };

  const href = buildGoogleMapsUrl(points);
  const segments = buildGoogleMapsRouteSegments(points);
  const content = (
    <>
      <Navigation size={15} aria-hidden="true" />
      Open in Google Maps
    </>
  );

  return (
    <div className="google-maps-navigation">
      {!href ? (
        <button
          type="button"
          className="button-secondary navigation-button"
          disabled
          data-testid={testId}
          aria-label="Open walk in Google Maps"
        >
          {content}
        </button>
      ) : (
        <a
          className="button-secondary navigation-button"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={testId}
          aria-label="Open walk in Google Maps"
          onClick={openInGoogleMaps}
        >
          {content}
        </a>
      )}
      {segments.length > 0 && (
        <nav className="google-maps-route-segments" aria-label="Google Maps route parts" data-testid={`${testId}-segments`}>
          <p>For mobile browsers, open these route parts in order. Each part starts where the previous one ends.</p>
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
