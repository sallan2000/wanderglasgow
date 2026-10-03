export class CatalogueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogueError';
  }
}

export type ManagedAttraction = {
  id: string;
  name: string;
  description: string;
  place: string;
  theme: string;
  lat: number;
  lon: number;
  published: boolean;
};

export function listAttractionCategories() {
  return Promise.resolve(['History', 'Museums']);
}

export function listManagedAttractions(): Promise<ManagedAttraction[]> {
  return Promise.resolve([]);
}