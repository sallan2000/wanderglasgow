import type { Position } from './attractions';
import type { ItinerarySnapshot } from './itinerary-snapshot';

export type ItineraryMapBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type ItineraryMapFeature = {
  kind: 'road' | 'waterway' | 'water' | 'green';
  subtype: string;
  name?: string;
  coordinates: Position[];
  closed: boolean;
};

export type ItineraryMapSnapshot = {
  bounds: ItineraryMapBounds;
  features: ItineraryMapFeature[];
};

const METRES_PER_DEGREE = 111_320;
const MAP_CACHE_TTL = 10 * 60 * 1000;
const MAX_MAP_AREA_KM2 = 200;
const MAX_FEATURES = 20_000;
const MAX_TOTAL_POINTS = 200_000;
const MAX_RESPONSE_CHARS = 12_000_000;
const mapCache = new Map<string, { snapshot: ItineraryMapSnapshot; expiresAt: number }>();

const validPosition = (point: Position) => point && Number.isFinite(point.lat) &&
  Number.isFinite(point.lon) && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;

export function itineraryMapBounds(itinerary: ItinerarySnapshot): ItineraryMapBounds {
  const positions: Position[] = [
    itinerary.start,
    ...itinerary.stops,
    ...(itinerary.geometry?.coordinates ?? []).map(([lon, lat]) => ({ lat, lon })),
  ];
  if (!positions.length || positions.some(point => !validPosition(point))) {
    throw new Error('This itinerary does not contain valid locations for a map.');
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const point of positions) {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLon = Math.min(minLon, point.lon);
    maxLon = Math.max(maxLon, point.lon);
  }
  const referenceLat = (minLat + maxLat) / 2;
  const metresPerLongitudeDegree = METRES_PER_DEGREE * Math.max(0.01, Math.cos(referenceLat * Math.PI / 180));
  let westMetres = minLon * metresPerLongitudeDegree;
  let eastMetres = maxLon * metresPerLongitudeDegree;
  let southMetres = minLat * METRES_PER_DEGREE;
  let northMetres = maxLat * METRES_PER_DEGREE;

  const minimumSide = 520;
  if (eastMetres - westMetres < minimumSide) {
    const center = (westMetres + eastMetres) / 2;
    westMetres = center - minimumSide / 2;
    eastMetres = center + minimumSide / 2;
  }
  if (northMetres - southMetres < minimumSide) {
    const center = (southMetres + northMetres) / 2;
    southMetres = center - minimumSide / 2;
    northMetres = center + minimumSide / 2;
  }

  const padding = Math.max(180, Math.max(eastMetres - westMetres, northMetres - southMetres) * 0.16);
  westMetres -= padding;
  eastMetres += padding;
  southMetres -= padding;
  northMetres += padding;

  const widthKm = (eastMetres - westMetres) / 1000;
  const heightKm = (northMetres - southMetres) / 1000;
  if (widthKm * heightKm > MAX_MAP_AREA_KM2) {
    throw new Error('This walk covers too large an area for one printable map. Shorten the walk or use the live map.');
  }

  return {
    south: southMetres / METRES_PER_DEGREE,
    west: westMetres / metresPerLongitudeDegree,
    north: northMetres / METRES_PER_DEGREE,
    east: eastMetres / metresPerLongitudeDegree,
  };
}

function cacheKey(bounds: ItineraryMapBounds) {
  return [bounds.south, bounds.west, bounds.north, bounds.east].map(value => value.toFixed(6)).join(',');
}

function categoryFor(tags: Record<string, unknown>): Pick<ItineraryMapFeature, 'kind' | 'subtype'> | null {
  if (typeof tags.highway === 'string') return { kind: 'road', subtype: tags.highway };
  if (typeof tags.waterway === 'string') return { kind: 'waterway', subtype: tags.waterway };
  if (tags.natural === 'water' || tags.landuse === 'reservoir') {
    return { kind: 'water', subtype: String(tags.water ?? tags.landuse ?? 'water') };
  }
  if (tags.leisure === 'park' || ['grass', 'meadow', 'forest', 'recreation_ground'].includes(String(tags.landuse))) {
    return { kind: 'green', subtype: String(tags.leisure ?? tags.landuse ?? 'green') };
  }
  return null;
}

function parseMapSnapshot(payload: unknown, bounds: ItineraryMapBounds): ItineraryMapSnapshot {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { elements?: unknown }).elements)) {
    throw new Error('OpenStreetMap returned an unreadable map response.');
  }
  const elements = (payload as { elements: unknown[] }).elements;
  if (elements.length > MAX_FEATURES) {
    throw new Error('This area has too much map detail for a printable itinerary. Try a shorter walk.');
  }

  const features: ItineraryMapFeature[] = [];
  const seen = new Set<number>();
  let totalPoints = 0;
  for (const value of elements) {
    if (!value || typeof value !== 'object') continue;
    const element = value as {
      id?: unknown;
      type?: unknown;
      tags?: unknown;
      geometry?: unknown;
    };
    if (element.type !== 'way' || !Array.isArray(element.geometry)) continue;
    if (typeof element.id === 'number' && seen.has(element.id)) continue;
    const tags = element.tags && typeof element.tags === 'object'
      ? element.tags as Record<string, unknown>
      : {};
    const category = categoryFor(tags);
    if (!category) continue;

    const coordinates: Position[] = [];
    for (const value of element.geometry) {
      if (!value || typeof value !== 'object') continue;
      const point = value as { lat?: unknown; lon?: unknown };
      const position = { lat: point.lat as number, lon: point.lon as number };
      if (!validPosition(position)) {
        coordinates.length = 0;
        break;
      }
      coordinates.push(position);
    }
    if (coordinates.length < 2) continue;

    totalPoints += coordinates.length;
    if (totalPoints > MAX_TOTAL_POINTS) {
      throw new Error('This area has too much map detail for a printable itinerary. Try a shorter walk.');
    }
    if (typeof element.id === 'number') seen.add(element.id);
    const first = coordinates[0];
    const last = coordinates.at(-1)!;
    features.push({
      ...category,
      ...(typeof tags.name === 'string' ? { name: tags.name.slice(0, 120) } : {}),
      coordinates,
      closed: coordinates.length > 2 && Math.abs(first.lat - last.lat) < 1e-8 && Math.abs(first.lon - last.lon) < 1e-8,
    });
  }

  if (!features.some(feature => feature.kind === 'road')) {
    throw new Error('OpenStreetMap did not return street data for this area. Please try again later.');
  }
  return { bounds, features };
}

export function validateItineraryMapSnapshot(snapshot: ItineraryMapSnapshot): void {
  const bounds = snapshot?.bounds;
  if (!bounds || ![bounds.south, bounds.west, bounds.north, bounds.east].every(Number.isFinite) ||
      bounds.south < -90 || bounds.north > 90 || bounds.west < -180 || bounds.east > 180 ||
      bounds.south >= bounds.north || bounds.west >= bounds.east ||
      !Array.isArray(snapshot.features) || snapshot.features.length < 1 || snapshot.features.length > MAX_FEATURES) {
    throw new Error('The street map could not be prepared for this itinerary.');
  }
  let totalPoints = 0;
  for (const feature of snapshot.features) {
    if (!feature || !['road', 'waterway', 'water', 'green'].includes(feature.kind) ||
        typeof feature.subtype !== 'string' || feature.subtype.length > 80 ||
        (feature.name !== undefined && (typeof feature.name !== 'string' || feature.name.length > 120)) ||
        typeof feature.closed !== 'boolean' || !Array.isArray(feature.coordinates) ||
        feature.coordinates.length < 2) {
      throw new Error('The street map contains invalid data. Please prepare it again.');
    }
    totalPoints += feature.coordinates.length;
    if (totalPoints > MAX_TOTAL_POINTS || feature.coordinates.some(point => !validPosition(point))) {
      throw new Error('The street map contains invalid data. Please prepare it again.');
    }
  }
}

export async function fetchItineraryMapSnapshot(
  itinerary: ItinerarySnapshot,
  signal?: AbortSignal,
): Promise<ItineraryMapSnapshot> {
  const bounds = itineraryMapBounds(itinerary);
  const key = cacheKey(bounds);
  const cached = mapCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.snapshot;
  if (cached) mapCache.delete(key);

  const bbox = [bounds.south, bounds.west, bounds.north, bounds.east].map(value => value.toFixed(6)).join(',');
  const query = `[out:json][timeout:25][maxsize:12000000];(way["highway"](${bbox});way["waterway"~"^(river|canal|stream)$"](${bbox});way["natural"="water"](${bbox});way["leisure"="park"](${bbox});way["landuse"~"^(grass|meadow|forest|recreation_ground|reservoir)$"](${bbox}););out geom;`;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 30_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'strict-origin-when-cross-origin',
    });
    if (!response.ok) throw new Error(`Map service returned ${response.status}.`);
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARS) {
      throw new Error('This area has too much map detail for a printable itinerary. Try a shorter walk.');
    }
    const snapshot = parseMapSnapshot(JSON.parse(text), bounds);
    validateItineraryMapSnapshot(snapshot);
    mapCache.set(key, { snapshot, expiresAt: Date.now() + MAP_CACHE_TTL });
    if (mapCache.size > 8) {
      const oldest = mapCache.keys().next().value;
      if (oldest) mapCache.delete(oldest);
    }
    return snapshot;
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Map request cancelled.', 'AbortError');
    if (error instanceof Error && error.message.startsWith('This area has too much map detail')) throw error;
    if (error instanceof Error && error.message.startsWith('OpenStreetMap')) throw error;
    throw new Error('The OpenStreetMap street map could not be loaded. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
