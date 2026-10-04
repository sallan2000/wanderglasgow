import { attractions, distanceKm, type Attraction, type Position } from './attractions';
import type { Theme } from './tours';
import { findEfficientOrderAsync, MAX_WALK_CANDIDATES, WalkOptimisationLimitError } from './efficient-walk-order';
export { findEfficientOrder } from './efficient-walk-order';

// The "5 km+" choice is a bounded search, not an unlimited walking request.
export const SEARCH_RADII_KM = [1, 2, 3, 4, 5, 10] as const;
export const defaultWalkLimitKm = (radiusKm: number) => radiusKm === 10 ? 15 : 5;

export type PlannerOptions = {
  theme: Theme | Theme[] | 'All';
  radiusKm: number;
  maxStops: number;
  maxWalkKm?: number;
};
export type NearbyAttraction = Attraction & { walkingDistanceMeters: number; included: boolean };
export type PlannedWalk = {
  origin: Position;
  theme: Theme | Theme[] | 'All';
  stops: Attraction[];
  nearby: NearbyAttraction[];
  distanceMeters: number;
  durationSeconds: number;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  excludedCount: number;
};

export class WalkPlanningError extends Error {
  constructor(message: string, public kind: 'empty' | 'service' | 'location') {
    super(message);
    this.name = 'WalkPlanningError';
  }
}

let requestQueue: Promise<void> = Promise.resolve();
let lastRequest = 0;
async function routingJson(url: string, signal?: AbortSignal) {
  // Public routing service: space requests at least one second apart.
  const slot = requestQueue.then(async () => {
    const wait = Math.max(0, lastRequest + 1100 - Date.now());
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    lastRequest = Date.now();
  });
  requestQueue = slot.catch(() => {});
  await slot;
  if (signal?.aborted) throw new DOMException('Planning cancelled.', 'AbortError');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 30000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Routing service returned ${response.status}.`);
    const data = await response.json();
    if (data.code !== 'Ok') throw new Error('Routing service could not find a walking connection.');
    return data;
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Planning cancelled.', 'AbortError');
    throw new WalkPlanningError('The walking service is unavailable. Please try again; no estimated straight-line route has been substituted.', 'service');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export async function planAttractionWalk(
  origin: Position, options: PlannerOptions, signal?: AbortSignal, catalogue: Attraction[] = attractions,
): Promise<PlannedWalk> {
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lon) ||
      origin.lat < -90 || origin.lat > 90 || origin.lon < -180 || origin.lon > 180) {
    throw new WalkPlanningError('Choose a valid starting location.', 'location');
  }
  // A selection matches ANY selected category, never categories outside that set.
  // Retain single-category inputs for existing callers; only scalar 'All' is unrestricted.
  const selectedThemes = options.theme === 'All' ? null :
    typeof options.theme === 'string' ? [options.theme] : options.theme;
  if (!SEARCH_RADII_KM.some(radius => radius === options.radiusKm) || !Number.isInteger(options.maxStops) ||
      options.maxStops < 1 || options.maxStops > 6 ||
       (selectedThemes !== null && (!Array.isArray(selectedThemes) || !selectedThemes.length ||
         selectedThemes.some(theme => typeof theme !== 'string' || !theme.trim() || theme.length > 40)))) {
    throw new WalkPlanningError('Choose at least one valid category, a radius and number of stops.', 'location');
  }
  const maxWalkKm = options.maxWalkKm ?? defaultWalkLimitKm(options.radiusKm);
  if (!Number.isFinite(maxWalkKm) || maxWalkKm <= 0 || maxWalkKm > 15) {
    throw new WalkPlanningError('Choose a walking limit between zero and 15 km.', 'location');
  }
  const categoryFilter = selectedThemes === null ? null : new Set(selectedThemes);
  const candidates = catalogue
    .filter(item => categoryFilter === null || categoryFilter.has(item.theme))
    .map(item => ({ item, distance: distanceKm(origin, item) }))
    .filter(entry => entry.distance <= options.radiusKm)
    .sort((a, b) => a.distance - b.distance)
    .map(entry => entry.item);
  if (!candidates.length) throw new WalkPlanningError(
    'No attractions match your selected categories near your starting point. Try different categories, a wider radius, or another Glasgow start.', 'empty');
  if (candidates.length > MAX_WALK_CANDIDATES) throw new WalkPlanningError(
    `More than ${MAX_WALK_CANDIDATES} matching sights are nearby. Choose a smaller radius or more specific categories so every candidate can be compared; no approximate walk has been substituted.`, 'location');
  const coordinates = [origin, ...candidates].map(point => `${point.lon},${point.lat}`).join(';');
  const table = await routingJson(
    `https://routing.openstreetmap.de/routed-foot/table/v1/foot/${coordinates}?annotations=distance,duration`, signal);
  if (!Array.isArray(table.distances) || table.distances.length !== candidates.length + 1 ||
      table.distances.some((row: unknown) => !Array.isArray(row) || row.length !== candidates.length + 1 ||
        row.some(v => v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)))) {
    throw new WalkPlanningError('The walking service returned incomplete distances. Please try again.', 'service');
  }
  // "Nearby" means reachable by foot within the radius, not just close across a river.
  const reachable = candidates.map((item, index) => ({ item, index: index + 1, distance: table.distances[0][index + 1] }))
    .filter(entry => typeof entry.distance === 'number' && Number.isFinite(entry.distance) &&
      entry.distance >= 0 && entry.distance <= options.radiusKm * 1000)
    .sort((a, b) => a.distance - b.distance);
  if (!reachable.length) throw new WalkPlanningError(
    'No matching attractions are within that walking distance. Try a wider radius or all categories.', 'empty');
  const indices = [0, ...reachable.map(entry => entry.index)];
  const matrix = indices.map(a => indices.map(b => table.distances[a][b] as number | null));
  let chosen;
  try {
    chosen = await findEfficientOrderAsync(matrix, options.maxStops, maxWalkKm * 1000, signal);
  } catch (error) {
    if (error instanceof WalkOptimisationLimitError) throw new WalkPlanningError(error.message, 'location');
    throw error;
  }
  if (!chosen.order.length) throw new WalkPlanningError(
    'No matching attractions fit the walking-distance limit. Try a closer starting point or increase the limit.', 'empty');
  const stops = chosen.order.map(index => reachable[index - 1].item);
  const routeCoordinates = [origin, ...stops].map(point => `${point.lon},${point.lat}`).join(';');
  const result = await routingJson(
    `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${routeCoordinates}?overview=full&geometries=geojson&continue_straight=false`, signal);
  const route = result.routes?.[0];
  if (route?.geometry?.type !== 'LineString' || !Array.isArray(route.geometry.coordinates) ||
      !Number.isFinite(route.distance) || route.distance < 0 || !Number.isFinite(route.duration) || route.duration < 0) {
    throw new WalkPlanningError('The walking service returned an incomplete route. Please try again.', 'service');
  }
  if (route.distance > maxWalkKm * 1000 + 2) throw new WalkPlanningError(
    'The final walking route exceeded the distance limit. Try fewer stops or a closer start.', 'service');
  // The route must match the distances used for its optimisation, allowing only
  // small rounding differences. Never present an extra detour as the optimum.
  if (Math.abs(route.distance - chosen.distanceMeters) > 2) throw new WalkPlanningError(
    'The walking service returned a route that does not match the optimised distances. Please try again; no less-efficient route has been substituted.', 'service');
  const selected = new Set(stops.map(stop => stop.id));
  return {
    origin, theme: Array.isArray(options.theme) ? [...options.theme] : options.theme, stops,
    nearby: reachable.map(({ item, distance }) => ({ ...item, walkingDistanceMeters: distance, included: selected.has(item.id) })),
    distanceMeters: route.distance, durationSeconds: route.duration, geometry: route.geometry,
    excludedCount: reachable.length - stops.length,
  };
}