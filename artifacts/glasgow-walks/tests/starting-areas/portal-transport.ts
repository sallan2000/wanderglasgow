import {
  supabase as authClient,
  checkAdmin,
  CatalogueError,
  initialPasswordRecovery,
} from '../walk-browser/auth-transport';
import { supabase as areaClient } from './transport';

export { checkAdmin, CatalogueError, initialPasswordRecovery };

// The isolated admin portal needs the auth fixture and the starting-area
// fixture's query builder, but never a live Supabase connection.
export const supabase: any = authClient
  ? { ...authClient, from: areaClient.from.bind(areaClient) }
  : null;

export class CategorySetupError extends CatalogueError {}

export async function listManagedAttractions() {
  return [];
}

export async function deleteAttraction() {}

export async function listAttractionCategories() {
  return ['History', 'Museums'];
}

export function sortCategoryNames(names: string[]) {
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

export async function addAttractionCategory(name: string) {
  return name;
}

export async function saveAttraction() {
  throw new Error('Attraction saving is not part of the starting-area portal fixture.');
}