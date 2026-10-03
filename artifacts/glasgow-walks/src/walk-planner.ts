import { attractions, distanceKm, type Attraction, type Position } from './attractions';
import type { Theme } from './tours';

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

/** Exact shortest open path for the most stops within a walking-distance budget.
 * Matrix index zero is the fixed origin. No forced return to the start.
 * Bound the candidate pool to keep the calculation small on phones.
 */
export function findEfficientOrder(matrix: (number | null)[][], maxStops: number, budgetMeters: number) {
  const count = matrix.length - 1;
  if (count < 1) return { order: [] as number[], distanceMeters: 0 };
  if (count > 12 || matrix.some(row => row.length !== count + 1)) throw new Error('Invalid distance matrix.');
  if (!Number.isFinite(budgetMeters) || budgetMeters <= 0) throw new Error('Invalid walking budget.');
  const limit = Math.min(count, Math.max(1, Math.floor(maxStops)));
  const states = 1 << count;
  const cost = new Float64Array(states * count).fill(Infinity);
  const previous = new Int16Array(states * count).fill(-1);
  const size = new Uint8Array(states);
  for (let mask = 1; mask < states; mask++) size[mask] = size[mask >> 1] + (mask & 1);
  const valid = (value: number | null): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;
  for (let last = 0; last < count; last++) {
    const distance = matrix[0][last + 1];
    if (valid(distance) && distance <= budgetMeters) cost[(1 << last) * count + last] = distance;
  }
  let bestMask = 0, bestLast = -1, bestCount = 0, bestDistance = Infinity;
  for (let mask = 1; mask < states; mask++) {
    if (size[mask] > limit) continue;
    for (let last = 0; last < count; last++) {
      const current = cost[mask * count + last];
      if (!Number.isFinite(current)) continue;
      if (size[mask] > bestCount || (size[mask] === bestCount && current < bestDistance)) {
        bestMask = mask; bestLast = last; bestCount = size[mask]; bestDistance = current;
      }
      if (size[mask] === limit) continue;
      for (let next = 0; next < count; next++) {
        if (mask & (1 << next)) continue;
        const leg = matrix[last + 1][next + 1];
        if (!valid(leg)) continue;
        const nextMask = mask | (1 << next);
        const nextCost = current + leg;
        const index = nextMask * count + next;
        if (nextCost <= budgetMeters && nextCost < cost[index]) {
          cost[index] = nextCost;
          previous[index] = last;
        }
      }
    }
  }
  const order: number[] = [];
  let mask = bestMask, last = bestLast;
  while (last >= 0) {
    order.push(last + 1);
    const prior = previous[mask * count + last];
    mask ^= 1 << last;
    last = prior;
  }
  return { order: order.reverse(), distanceMeters: order.length ? bestDistance : 0 };
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
  if (![1, 2, 3, 5].includes(options.radiusKm) || !Number.isInteger(options.maxStops) ||
      options.maxStops < 1 || options.maxStops > 6 ||
       (selectedThemes !== null && (!Array.isArray(selectedThemes) || !selectedThemes.length ||
         selectedThemes.some(theme => typeof theme !== 'string' || !theme.trim() || theme.length > 40)))) {
    throw new WalkPlanningError('Choose at least one valid category, a radius and number of stops.', 'location');
  }
  const maxWalkKm = options.maxWalkKm ?? 5;
  if (!Number.isFinite(maxWalkKm) || maxWalkKm <= 0 || maxWalkKm > 15) {
    throw new WalkPlanningError('Choose a walking limit between zero and 15 km.', 'location');
  }
  const categoryFilter = selectedThemes === null ? null : new Set(selectedThemes);
  const candidates = catalogue
    .filter(item => categoryFilter === null || categoryFilter.has(item.theme))
    .map(item => ({ item, distance: distanceKm(origin, item) }))
    .filter(entry => entry.distance <= options.radiusKm)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 12).map(entry => entry.item);
  if (!candidates.length) throw new WalkPlanningError(
    'No attractions match your selected categories near your starting point. Try different categories, a wider radius, or another Glasgow start.', 'empty');
  const coordinates = [origin, ...candidates].map(point => `${point.lon},${point.lat}`).join(';');
  const table = await routingJson(
    `https://routing.openstreetmap.de/routed-foot/table/v1/foot/${coordinates}?annotations=distance,duration`, signal);
  if (!Array.isArray(table.distances) || table.distances.length !== candidates.length + 1 ||
      table.distances.some((row: unknown) => !Array.isArray(row) || row.length !== candidates.length + 1)) {
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
  const chosen = findEfficientOrder(matrix, options.maxStops, maxWalkKm * 1000);
  if (!chosen.order.length) throw new WalkPlanningError(
    'No matching attractions fit the walking-distance limit. Try a closer starting point or increase the limit.', 'empty');
  const stops = chosen.order.map(index => reachable[index - 1].item);
  const routeCoordinates = [origin, ...stops].map(point => `${point.lon},${point.lat}`).join(';');
  const result = await routingJson(
    `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${routeCoordinates}?overview=full&geometries=geojson`, signal);
  const route = result.routes?.[0];
  if (route?.geometry?.type !== 'LineString' || !Array.isArray(route.geometry.coordinates) ||
      !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
    throw new WalkPlanningError('The walking service returned an incomplete route. Please try again.', 'service');
  }
  if (route.distance > maxWalkKm * 1000 + 50) throw new WalkPlanningError(
    'The final walking route exceeded the distance limit. Try fewer stops or a closer start.', 'service');
  const selected = new Set(stops.map(stop => stop.id));
  return {
    origin, theme: Array.isArray(options.theme) ? [...options.theme] : options.theme, stops,
    nearby: reachable.map(({ item, distance }) => ({ ...item, walkingDistanceMeters: distance, included: selected.has(item.id) })),
    distanceMeters: route.distance, durationSeconds: route.duration, geometry: route.geometry,
    excludedCount: reachable.length - stops.length,
  };
}