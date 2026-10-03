import type { Attraction } from '../../src/attractions';
import { fixtureAttractions, mapFixtureState } from './map-fixture-state';

export class CatalogueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogueError';
  }
}

export async function loadPublicCatalogue(_signal?: AbortSignal): Promise<{ attractions: Attraction[] }> {
  mapFixtureState.catalogueLoads++;
  return { attractions: fixtureAttractions };
}