import { state } from './transport';
import type { Position } from '../../src/attractions';
import type { PlannedWalk, PlannerOptions } from '../../src/walk-planner';
export const SEARCH_RADII_KM = [1, 2, 3, 4, 5, 10];
export const defaultWalkLimitKm = (radius: number) => radius === 10 ? 15 : 5;
export class WalkPlanningError extends Error {}
export async function planAttractionWalk(origin: Position, options: PlannerOptions): Promise<PlannedWalk> {
  state.origin = origin;
  return { origin, theme: options.theme, stops: [], nearby: [], distanceMeters: 100, durationSeconds: 60,
    geometry: { type: 'LineString', coordinates: [[origin.lon, origin.lat], [origin.lon + 0.001, origin.lat + 0.001]] }, excludedCount: 0 };
}