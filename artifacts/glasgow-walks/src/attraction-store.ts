import { createClient } from '@supabase/supabase-js';
import { attractions, type Attraction } from './attractions';
import { DEFAULT_CATEGORIES, type Theme } from './tours';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
// Capture this before the SDK consumes and clears the recovery URL.
export const initialPasswordRecovery = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery';
export const supabase = url && key ? createClient(url, key, {
  auth: { storageKey: 'glasgow-walks-admin', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;

export type ManagedAttraction = Attraction & { published: boolean; updatedAt?: string };
export type AttractionInput = Omit<ManagedAttraction, 'id' | 'updatedAt'>;
type Row = {
  id: string; name: string; description: string; place: string; theme: Theme;
  latitude: number; longitude: number; published: boolean; updated_at: string;
};

export class CatalogueError extends Error {
  constructor(message: string) { super(message); this.name = 'CatalogueError'; }
}
const missingSchema = (error: { code?: string }) => ['PGRST205', 'PGRST202', '42P01', '42883'].includes(error.code ?? '');
function fail(error: { code?: string; message?: string }): never {
  if (missingSchema(error)) throw new CatalogueError('Attraction storage is not set up yet. Run the supplied Supabase setup.sql, then try again.');
  if (error.code === '42501') throw new CatalogueError('Permission denied. This account must be authorised as an attraction administrator.');
  if (error.code === '23505') throw new CatalogueError('An attraction with that name already exists. Edit the existing entry instead.');
  if (error.code === '23503') throw new CatalogueError('That category is no longer available. Refresh the catalogue and select an existing category.');
  throw new CatalogueError('Supabase could not complete the request. Check your connection and project settings, then try again.');
}
function client() {
  if (!supabase) throw new CatalogueError('Supabase is not configured. Add the project URL and public publishable key, then rebuild the website.');
  return supabase;
}
function fromRow(row: Row): ManagedAttraction {
  return { id: row.id, name: row.name, description: row.description, place: row.place,
    theme: row.theme, lat: Number(row.latitude), lon: Number(row.longitude),
    published: row.published, updatedAt: row.updated_at };
}

export function validateAttraction(input: AttractionInput): AttractionInput {
  const data = { ...input, name: input.name.trim(), description: input.description.trim(), place: input.place.trim() };
  if (data.name.length < 2 || data.name.length > 200) throw new CatalogueError('Use an attraction name between 2 and 200 characters.');
  if (data.description.length < 10 || data.description.length > 5000) throw new CatalogueError('Use a description between 10 and 5,000 characters.');
  if (data.place.length > 300) throw new CatalogueError('Keep the address or location label under 300 characters.');
  if (typeof data.theme !== 'string' || data.theme.trim().length < 2 || data.theme.length > 40 || data.theme.toLowerCase() === 'all') {
    throw new CatalogueError('Choose exactly one existing attraction category.');
  }
  if (!Number.isFinite(data.lat) || data.lat < -90 || data.lat > 90 ||
      !Number.isFinite(data.lon) || data.lon < -180 || data.lon > 180) throw new CatalogueError('Enter valid latitude and longitude coordinates, or select a point on the map.');
  if (typeof data.published !== 'boolean') throw new CatalogueError('Choose whether the attraction is published.');
  return data;
}

export async function checkAdmin(): Promise<boolean> {
  const { data, error } = await client().rpc('is_attraction_admin');
  if (error) fail(error);
  return data === true;
}

export function sortCategoryNames(names: string[]): string[] {
  return [...new Set(names)].sort((a, b) => {
    const ai = DEFAULT_CATEGORIES.indexOf(a), bi = DEFAULT_CATEGORIES.indexOf(b);
    if (ai >= 0 || bi >= 0) return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi);
    return a.localeCompare(b);
  });
}

export class CategorySetupError extends CatalogueError {
  constructor() {
    super('Custom categories are not enabled yet. Run categories-upgrade.sql in your Supabase SQL Editor, then refresh.');
    this.name = 'CategorySetupError';
  }
}

export async function listAttractionCategories(signal?: AbortSignal): Promise<string[]> {
  const names: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = client().from('glasgow_attraction_categories').select('name').order('name').range(offset, offset + 999);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (signal?.aborted) throw new DOMException('Cancelled.', 'AbortError');
    if (error) {
      if (missingSchema(error)) throw new CategorySetupError();
      throw new CatalogueError('Attraction categories could not be loaded. Check your connection and try again.');
    }
    names.push(...data.map((row: { name: string }) => row.name));
    if (data.length < 1000) return sortCategoryNames(names);
  }
}

export async function loadPublicCategories(signal?: AbortSignal): Promise<{ categories: string[]; notice?: string }> {
  if (!supabase) return { categories: DEFAULT_CATEGORIES, notice: 'Shared categories are not configured; the original categories are shown.' };
  try {
    return { categories: await listAttractionCategories(signal) };
  } catch (error) {
    // Older installations retain their original category list until the owner upgrades.
    // A genuine service failure is reported rather than silently substituting defaults.
    if (error instanceof CategorySetupError) {
      return { categories: DEFAULT_CATEGORIES, notice: 'The original categories are shown while custom category support is being enabled.' };
    }
    throw error;
  }
}

export async function addAttractionCategory(input: string): Promise<string> {
  const name = input.trim();
  if (name.length < 2 || name.length > 40) throw new CatalogueError('Use a category name between 2 and 40 characters.');
  if (name.toLowerCase() === 'all') throw new CatalogueError('“All” is reserved for showing every category. Choose another name.');
  const { data, error } = await client().from('glasgow_attraction_categories').insert({ name }).select('name').single();
  if (error) {
    if (missingSchema(error)) throw new CategorySetupError();
    if (error.code === '23505') throw new CatalogueError('A category with that name already exists.');
    if (error.code === '23514') throw new CatalogueError('Use a category name between 2 and 40 characters, other than “All”.');
    fail(error);
  }
  return data.name;
}

async function readRows(publicOnly: boolean, signal?: AbortSignal): Promise<ManagedAttraction[]> {
  const rows: ManagedAttraction[] = [];
  // Explicit pagination prevents Supabase's default row limit truncating the catalogue.
  for (let offset = 0; ; offset += 1000) {
    if (signal?.aborted) throw new DOMException('Cancelled.', 'AbortError');
    let query = client().from('glasgow_attractions').select('*').order('id').range(offset, offset + 999);
    if (publicOnly) query = query.eq('published', true);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (signal?.aborted) throw new DOMException('Cancelled.', 'AbortError');
    if (error) fail(error);
    rows.push(...(data as Row[]).map(fromRow));
    if (data.length < 1000) break;
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadPublicCatalogue(signal?: AbortSignal): Promise<{ attractions: Attraction[]; notice?: string }> {
  if (!supabase) return { attractions, notice: 'Shared attraction storage is not configured. This walk uses the original catalogue.' };
  try {
    return { attractions: await readRows(true, signal) };
  } catch (error) {
    // Keep the existing visitor experience usable during the explicit initial setup.
    // Never conceal a live service failure or replace an intentionally empty catalogue.
    if (error instanceof CatalogueError && error.message.startsWith('Attraction storage is not set up')) {
      return { attractions, notice: 'Shared attraction storage has not been set up yet. This walk uses the original catalogue; admin-added attractions are not available yet.' };
    }
    throw error;
  }
}
export function listManagedAttractions() { return readRows(false); }

export async function saveAttraction(input: AttractionInput, existing?: ManagedAttraction): Promise<ManagedAttraction> {
  const valid = validateAttraction(input);
  const row = { name: valid.name, description: valid.description, place: valid.place, theme: valid.theme,
    latitude: valid.lat, longitude: valid.lon, published: valid.published };
  let query;
  if (existing) {
    let update = client().from('glasgow_attractions').update(row).eq('id', existing.id);
    if (existing.updatedAt) update = update.eq('updated_at', existing.updatedAt);
    query = update.select().maybeSingle();
  } else {
    query = client().from('glasgow_attractions').insert({ ...row, id: crypto.randomUUID() }).select().single();
  }
  const { data, error } = await query;
  if (error) fail(error);
  if (!data) throw new CatalogueError('This entry was changed or removed by another administrator. Refresh the list before editing again.');
  return fromRow(data as Row);
}

export async function deleteAttraction(item: ManagedAttraction): Promise<void> {
  let query = client().from('glasgow_attractions').delete().eq('id', item.id);
  if (item.updatedAt) query = query.eq('updated_at', item.updatedAt);
  const { data, error } = await query.select('id');
  if (error) fail(error);
  if (!data?.length) throw new CatalogueError('This entry changed or you no longer have permission. Refresh the list before deleting again.');
}