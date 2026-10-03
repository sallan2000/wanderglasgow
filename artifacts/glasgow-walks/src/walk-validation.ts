import type { Tour, Stop } from './tours';

export type ManagedWalk = Tour & { published: boolean; updatedAt?: string };
export type WalkInput = Omit<Tour, 'id' | 'start'> & { published: boolean };

export function validateWalk(input: WalkInput): WalkInput {
  const text = (value: unknown, label: string, min: number, max: number) => {
    if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max)
      throw new Error(`${label} must be between ${min} and ${max.toLocaleString()} characters.`);
    return value.trim();
  };
  if (typeof input.published !== 'boolean') throw new Error('Choose draft or published status.');
  const title = text(input.title, 'Walk title', 3, 200);
  const subtitle = text(input.subtitle, 'Walk description', input.published ? 10 : 0, 1000);
  const theme = text(input.theme, 'Category', 2, 40);
  if (theme.toLowerCase() === 'all') throw new Error('Choose an existing category, not “All”.');
  if (!Array.isArray(input.stops) || input.stops.length > 30 || (input.published && input.stops.length < 2))
    throw new Error('Published walks need 2–30 stops. Drafts can contain up to 30.');
  const stops: Stop[] = input.stops.map((stop, i) => {
    if (!stop || !Number.isFinite(stop.lat) || !Number.isFinite(stop.lon) ||
      stop.lat < -90 || stop.lat > 90 || stop.lon < -180 || stop.lon > 180)
      throw new Error(`Stop ${i + 1} needs valid map coordinates.`);
    return {
      name: text(stop.name, `Stop ${i + 1} name`, 2, 200),
      place: text(stop.place, `Stop ${i + 1} location`, 0, 300),
      story: text(stop.story, `Stop ${i + 1} description`, 10, 5000),
      lat: stop.lat, lon: stop.lon,
    };
  });
  if (!Number.isFinite(input.distanceKm) || input.distanceKm < 0 || input.distanceKm > 100 ||
    !Number.isInteger(input.minutes) || input.minutes < 0 || input.minutes > 10000 ||
    (input.published && (input.distanceKm <= 0 || input.minutes <= 0)))
    throw new Error('Calculate walking distance and time before publishing.');
  return { title, subtitle, theme, stops, distanceKm: input.distanceKm, minutes: input.minutes, published: input.published };
}