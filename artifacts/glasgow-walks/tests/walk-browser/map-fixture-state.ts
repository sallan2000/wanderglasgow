import type { Attraction, Position } from '../../src/attractions';
import type { PlannerOptions } from '../../src/walk-planner';

export const fixtureAttractions: Attraction[] = [
  {
    id: 'cathedral',
    name: 'Glasgow Cathedral',
    description: 'A fixture attraction used to test the visitor map.',
    place: 'Castle Street',
    theme: 'History',
    lat: 55.862,
    lon: -4.234,
  },
  {
    id: 'george-square',
    name: 'George Square',
    description: 'A second fixture attraction used to test route markers.',
    place: 'City centre',
    theme: 'History',
    lat: 55.86,
    lon: -4.25,
  },
];

export const mapFixtureState = {
  catalogueLoads: 0,
  planCalls: [] as { origin: Position; options: PlannerOptions }[],
};

declare global {
  interface Window {
    plannerFixture?: typeof mapFixtureState;
  }
}

if (typeof window !== 'undefined') {
  Object.assign(window, { plannerFixture: mapFixtureState });
}