import type { ItinerarySnapshot } from './itinerary-snapshot';
import type { NavigationPoint } from './route-url';
import GoogleMapsNavigationLink from './GoogleMapsNavigationLink';
import './itinerary-actions.css';

export default function ItineraryActions({ itinerary }: { itinerary: ItinerarySnapshot }) {
  const planned = itinerary.kind === 'planned';
  const navigationPoints: NavigationPoint[] = itinerary.stops.map(stop => ({
    lat: stop.lat,
    lon: stop.lon,
    name: stop.name,
  }));
  if (itinerary.kind === 'planned') {
    navigationPoints.unshift({ lat: itinerary.start.lat, lon: itinerary.start.lon });
  }
  return (
    <div className="itinerary-actions" data-testid="section-itinerary-actions">
      <h4>Route to this walk</h4>
      <p data-testid="text-itinerary-privacy">
        {planned
          ? 'Download includes your chosen start and calculated route, which may include your GPS location.'
          : 'Download shows the listed stops, not GPS or a calculated route.'}
        {' '}OpenStreetMap gets the approximate map area and standard request data, not your file or stop stories. The HTML stays on your device unless shared.
      </p>
      <div className="itinerary-buttons">
        <GoogleMapsNavigationLink points={navigationPoints} testId="button-open-itinerary-navigation" />
      </div>
    </div>
  );
}
