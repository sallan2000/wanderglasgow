import { supabase } from './attraction-store';

export type StartingAreaInput = { name: string; lat: number; lon: number };
export type StartingArea = StartingAreaInput & { id: string; updatedAt: string };
type Row = { id: string; name: string; latitude: number; longitude: number; updated_at: string };
export const DEFAULT_STARTING_AREAS: StartingArea[] = [
  { id: 'centre', name: 'City centre', lat: 55.8609, lon: -4.2514, updatedAt: '' },
  { id: 'west', name: 'West End', lat: 55.8745, lon: -4.2916, updatedAt: '' },
  { id: 'east', name: 'East End', lat: 55.8545, lon: -4.2372, updatedAt: '' },
];
export class StartingAreaError extends Error {
  constructor(message: string) { super(message); this.name = 'StartingAreaError'; }
}
export class StartingAreaSetupError extends StartingAreaError {
  constructor() {
    super('Starting-area management is not installed yet. Run starting-areas-upgrade.sql in your Supabase SQL Editor, then refresh.');
    this.name = 'StartingAreaSetupError';
  }
}
function client() {
  if (!supabase) throw new StartingAreaError('Supabase is not configured. Add the project URL and public publishable key, then rebuild the website.');
  return supabase;
}
function fail(error: { code?: string }): never {
  if (['PGRST205', '42P01'].includes(error.code ?? '')) throw new StartingAreaSetupError();
  if (error.code === '23505') throw new StartingAreaError('A starting area with that name already exists.');
  if (error.code === '23514') throw new StartingAreaError('Use a name of 2–80 characters other than “My location”, and valid latitude and longitude.');
  if (error.code === '42501') throw new StartingAreaError('Permission denied. Only approved administrators can change starting areas.');
  throw new StartingAreaError('Starting areas could not be loaded or saved. Check your connection and try again.');
}
export function validateStartingArea(input: StartingAreaInput): StartingAreaInput {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw new StartingAreaError('Use a starting area name between 2 and 80 characters.');
  if (name.toLowerCase() === 'my location') throw new StartingAreaError('“My location” is reserved for GPS. Choose another name.');
  if (!Number.isFinite(input.lat) || Math.abs(input.lat) > 90 || !Number.isFinite(input.lon) || Math.abs(input.lon) > 180) {
    throw new StartingAreaError('Enter valid latitude and longitude, or select a point on the map.');
  }
  return { name, lat: input.lat, lon: input.lon };
}
function fromRow(row: Row): StartingArea {
  if (!row || typeof row.id !== 'string' || row.id === 'gps' || typeof row.updated_at !== 'string'
    || typeof row.name !== 'string' || typeof row.latitude !== 'number' || typeof row.longitude !== 'number') {
    throw new StartingAreaError('Starting-area storage returned invalid data. Refresh and try again.');
  }
  return { ...validateStartingArea({ name: row.name, lat: Number(row.latitude), lon: Number(row.longitude) }), id: row.id, updatedAt: row.updated_at };
}
export async function listStartingAreas(signal?: AbortSignal): Promise<StartingArea[]> {
  const result: StartingArea[] = [];
  for (let offset = 0; ; offset += 1000) {
    if (signal?.aborted) throw new DOMException('Cancelled.', 'AbortError');
    let query = client().from('glasgow_starting_areas').select('*').order('created_at').order('id').range(offset, offset + 999);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (signal?.aborted) throw new DOMException('Cancelled.', 'AbortError');
    if (error) fail(error);
    result.push(...(data as Row[]).map(fromRow));
    if (data.length < 1000) return result;
  }
}
export async function loadPublicStartingAreas(signal?: AbortSignal): Promise<{ areas: StartingArea[]; notice?: string }> {
  if (!supabase) return { areas: DEFAULT_STARTING_AREAS, notice: 'Shared starting areas are not configured. The original three starting points are shown.' };
  try { return { areas: await listStartingAreas(signal) }; }
  catch (error) {
    if (error instanceof StartingAreaSetupError) return {
      areas: DEFAULT_STARTING_AREAS,
      notice: 'Starting-area management has not been installed yet. The original three starting points are shown.',
    };
    throw error;
  }
}
export async function saveStartingArea(input: StartingAreaInput, existing?: StartingArea): Promise<StartingArea> {
  const valid = validateStartingArea(input);
  const row = { name: valid.name, latitude: valid.lat, longitude: valid.lon };
  const query = existing
    ? client().from('glasgow_starting_areas').update(row).eq('id', existing.id).eq('updated_at', existing.updatedAt).select().maybeSingle()
    : client().from('glasgow_starting_areas').insert({ ...row, id: crypto.randomUUID() }).select().single();
  const { data, error } = await query;
  if (error) fail(error);
  if (!data) throw new StartingAreaError('This area changed or was removed, or your access changed. Refresh before editing again.');
  return fromRow(data as Row);
}
export async function deleteStartingArea(item: StartingArea): Promise<void> {
  const { data, error } = await client().from('glasgow_starting_areas').delete()
    .eq('id', item.id).eq('updated_at', item.updatedAt).select('id');
  if (error) fail(error);
  if (!data?.length) throw new StartingAreaError('This area changed or your access changed. Refresh before deleting again.');
}