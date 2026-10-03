import type { Attraction, Position } from '../../src/attractions';
import type { PlannerOptions, PlannedWalk } from '../../src/walk-planner';
import { fixtureAttractions, mapFixtureState } from './map-fixture-state';

export const SEARCH_RADII_KM = [1, 2, 3, 4, 5, 10] as const;
export const defaultWalkLimitKm = (radiusKm: number) => radiusKm === 10 ? 15 : 5;

export class WalkPlanningError extends Error {
  constructor(message: string, public kind: 'empty' | 'service' | 'location') {
    super(message);
    this.name = 'WalkPlanningError';
  }
}

export async function planAttractionWalk(
  origin: Position,
  options: PlannerOptions,
  _signal?: AbortSignal,
  _catalogue?: Attraction[],
): Promise<PlannedWalk> {
  mapFixtureState.planCalls.push({ origin: { ...origin }, options: structuredClone(options) });
  const stops = fixtureAttractions;
  const coordinates: [number, number][] = [
    [origin.lon, origin.lat],
    ...stops.map(stop => [stop.lon, stop.lat] as [number, number]),
  ];
  return {
    origin: { ...origin },
    theme: options.theme,
    stops,
    nearby: stops.map(stop => ({ ...stop, walkingDistanceMeters: 400, included: true })),
    distanceMeters: 850,
    durationSeconds: 720,
    geometry: { type: 'LineString', coordinates },
    excludedCount: 0,
  };
}