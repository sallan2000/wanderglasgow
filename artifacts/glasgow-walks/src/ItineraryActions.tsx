import { useEffect, useRef, useState } from 'react';
import type { ItinerarySnapshot } from './itinerary-snapshot';
import { itineraryDocument } from './itinerary-document';
import { fetchItineraryMapSnapshot } from './itinerary-map';
import type { NavigationPoint } from './route-url';
import GoogleMapsNavigationLink from './GoogleMapsNavigationLink';
import './itinerary-actions.css';

export default function ItineraryActions({ itinerary }: { itinerary: ItinerarySnapshot }) {
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const mounted = useRef(true);

  const removeFrame = () => { frame.current?.remove(); frame.current = null; };
  useEffect(() => {
    mounted.current = true;
    const t = timers.current;
    return () => {
      mounted.current = false;
      t.forEach(clearTimeout); t.clear();
      removeFrame();
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => { timers.current.delete(id); fn(); }, ms);
    timers.current.add(id);
    return id;
  };

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
          ? 'This copy includes your chosen starting coordinates and calculated route, which may include your GPS location.'
          : 'This editorial copy shows the listed start and stop positions without a GPS connection or calculated route.'}
        {' '}To add the street map, the selected OpenStreetMap data service receives the approximate walk area and standard request information; it does not receive the itinerary file or stop stories. The completed HTML embeds the map and stays on your device unless you share it.
      </p>
      <div className="itinerary-buttons">
        <GoogleMapsNavigationLink points={navigationPoints} testId="button-open-itinerary-navigation" />
      </div>
      <div role="status" aria-live="polite" className="itinerary-status" data-testid="status-itinerary">{status}</div>
      {error && (
        <div role="alert" className="itinerary-error" data-testid="status-itinerary-error">
          {error}
        </div>
      )}
    </div>
  );
}
