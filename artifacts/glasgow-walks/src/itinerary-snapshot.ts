import type { Position } from './attractions';
import type { AccessDetails } from './access-details';
import type { Tour } from './tours';
import type { PlannedWalk } from './walk-planner';

export type ItineraryStop = Position & {
  name: string; place: string; story: string; access?: AccessDetails;
};
export type ItinerarySnapshot = {
  kind: 'curated' | 'planned';
  title: string;
  description: string;
  category: string;
  start: Position & { label: string };
  stops: ItineraryStop[];
  distanceMeters: number;
  durationSeconds: number;
  geometry?: PlannedWalk['geometry'];
};

// Snapshots use only the itinerary already on screen, never a fresh fetch.
export function curatedItinerary(tour: Tour): ItinerarySnapshot {
  const first = tour.stops[0];
  if (!first) throw new Error('This itinerary has no stops to export.');
  return {
    kind: 'curated', title: tour.title, description: tour.subtitle, category: tour.theme,
    start: { label: tour.start, lat: first.lat, lon: first.lon },
    stops: tour.stops.map(stop => ({ ...stop })),
    distanceMeters: tour.distanceKm * 1000, durationSeconds: tour.minutes * 60,
  };
}

export function plannedItinerary(plan: PlannedWalk): ItinerarySnapshot {
  return {
    kind: 'planned', title: 'Your calculated Glasgow walk',
    description: 'The stops in your calculated walking order.',
    category: Array.isArray(plan.theme) ? plan.theme.join(', ') : plan.theme === 'All' ? 'All categories' : plan.theme,
    start: { ...plan.origin, label: 'Chosen starting point' },
    stops: plan.stops.map(stop => ({
      name: stop.name, place: stop.place, story: stop.description, lat: stop.lat, lon: stop.lon,
      ...(stop.access ? { access: { ...stop.access } } : {}),
    })),
    distanceMeters: plan.distanceMeters, durationSeconds: plan.durationSeconds,
    ...(plan.geometry ? { geometry: {
      type: 'LineString', coordinates: plan.geometry.coordinates.map(point => [...point] as [number, number]),
    } } : {}),
  };
}