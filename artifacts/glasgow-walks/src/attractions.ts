import type { AccessDetails } from './access-details';
import { tours, type Theme } from './tours';

export type Position = { lat: number; lon: number };
export type Attraction = Position & {
  access?: AccessDetails;
  id: string;
  name: string;
  description: string;
  place: string;
  theme: Theme;
};

// Original catalogue: used by the one-time Supabase seed and explicitly
// labelled visitor planning before shared storage is installed.
export const attractions: Attraction[] = Array.from(
  new Map(tours.flatMap(tour => tour.stops.map(stop => {
    const id = stop.name.toLowerCase().replace(/^the /, '').normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return [id, { id, name: stop.name, description: stop.story, place: stop.place,
      lat: stop.lat, lon: stop.lon, theme: tour.theme }] as const;
  }))).values(),
);

export function distanceKm(a: Position, b: Position): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const value = Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}