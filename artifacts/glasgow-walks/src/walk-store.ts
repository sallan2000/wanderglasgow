import { supabase, CatalogueError } from './attraction-store';
import { tours, type Stop, type Tour } from './tours';
import { validateWalk, type ManagedWalk, type WalkInput } from './walk-validation';
export type { ManagedWalk, WalkInput } from './walk-validation';

type Row = { id: string; title: string; subtitle: string; theme: string; stops: Stop[];
  distance_km: number; minutes: number; published: boolean; updated_at: string };
export class WalkSetupError extends CatalogueError {
  constructor() {
    super('Curated walk storage is not enabled yet. Run curated-walks-upgrade.sql in your Supabase SQL Editor, then refresh.');
    this.name = 'WalkSetupError';
  }
}
function client() {
  if (!supabase) throw new CatalogueError('Supabase is not configured. Add the project URL and public publishable key, then rebuild.');
  return supabase;
}
function fail(error: { code?: string }): never {
  if (['PGRST205', '42P01'].includes(error.code ?? '')) throw new WalkSetupError();
  if (error.code === '42501') throw new CatalogueError('Permission denied. This account must be authorised as an administrator.');
  if (error.code === '23505') throw new CatalogueError('A walk with that title already exists. Use a different title or edit the existing walk.');
  if (error.code === '23503') throw new CatalogueError('That category is no longer available. Refresh categories and try again.');
  if (error.code === '23514') throw new CatalogueError('Check the walk details, stops and walking metrics before saving.');
  throw new CatalogueError('Curated walks could not be loaded or saved. Check your connection and Supabase settings, then try again.');
}
function fromRow(row: Row): ManagedWalk {
  let data: WalkInput;
  try {
    data = validateWalk({ title: row.title, subtitle: row.subtitle, theme: row.theme, stops: row.stops,
      distanceKm: Number(row.distance_km), minutes: row.minutes, published: row.published });
  } catch {
    throw new CatalogueError('A stored walk has invalid details. Ask an administrator to check the curated walk catalogue.');
  }
  return { ...data, id: row.id, start: data.stops[0]?.name ?? '', updatedAt: row.updated_at };
}
async function readWalks(publicOnly: boolean, signal?: AbortSignal): Promise<ManagedWalk[]> {
  const rows: ManagedWalk[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = client().from('glasgow_curated_walks').select('*').order('id').range(offset, offset + 999);
    if (publicOnly) query = query.eq('published', true);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (signal?.aborted) throw new DOMException('Cancelled.', 'AbortError');
    if (error) fail(error);
    rows.push(...(data as Row[]).map(fromRow));
    if (data.length < 1000) return rows.sort((a, b) => a.title.localeCompare(b.title));
  }
}
export const listManagedWalks = () => readWalks(false);
export async function loadPublicWalks(signal?: AbortSignal): Promise<{ walks: Tour[]; notice?: string }> {
  if (!supabase) return { walks: tours, notice: 'Shared walk storage is not configured; the original curated walks are shown.' };
  try { return { walks: await readWalks(true, signal) }; }
  catch (error) {
    if (error instanceof WalkSetupError)
      return { walks: tours, notice: 'The original curated walks are shown while shared walk storage is being enabled.' };
    throw error;
  }
}
export async function saveWalk(input: WalkInput, existing?: ManagedWalk): Promise<ManagedWalk> {
  let valid: WalkInput;
  try { valid = validateWalk(input); }
  catch (e) { throw new CatalogueError(e instanceof Error ? e.message : 'Check the walk details.'); }
  const row = { title: valid.title, subtitle: valid.subtitle, theme: valid.theme, stops: valid.stops,
    distance_km: valid.distanceKm, minutes: valid.minutes, published: valid.published };
  let query;
  if (existing) {
    let update = client().from('glasgow_curated_walks').update(row).eq('id', existing.id);
    if (existing.updatedAt) update = update.eq('updated_at', existing.updatedAt);
    query = update.select().maybeSingle();
  } else {
    query = client().from('glasgow_curated_walks').insert({ ...row, id: crypto.randomUUID() }).select().single();
  }
  const { data, error } = await query;
  if (error) fail(error);
  if (!data) throw new CatalogueError('This walk was changed or removed by another administrator. Refresh before editing again.');
  return fromRow(data as Row);
}
export async function deleteWalk(existing: ManagedWalk): Promise<void> {
  let query = client().from('glasgow_curated_walks').delete().eq('id', existing.id);
  if (existing.updatedAt) query = query.eq('updated_at', existing.updatedAt);
  const { data, error } = await query.select('id');
  if (error) fail(error);
  if (!data?.length) throw new CatalogueError('This walk changed or you no longer have permission. Refresh before deleting again.');
}
export async function measureCuratedWalk(stops: Stop[], signal?: AbortSignal): Promise<{ distanceKm: number; minutes: number }> {
  if (stops.length < 2 || stops.length > 30) throw new CatalogueError('Choose 2–30 ordered stops before calculating a route.');
  const coordinates = stops.map(s => `${s.lon},${s.lat}`).join(';');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timeout = setTimeout(abort, 30000);
  try {
    const response = await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coordinates}?overview=false`, { signal: controller.signal });
    if (!response.ok) throw new Error('Routing unavailable');
    const result = await response.json();
    const route = result.routes?.[0];
    if (result.code !== 'Ok' || !Number.isFinite(route?.distance) || route.distance <= 0 ||
      !Number.isFinite(route?.duration) || route.duration <= 0 || route.distance > 100000 || route.duration > 600000)
      throw new Error('No valid walking route');
    return { distanceKm: Math.round(route.distance) / 1000, minutes: Math.ceil(route.duration / 60) };
  } catch {
    if (signal?.aborted) throw new DOMException('Cancelled.', 'AbortError');
    throw new CatalogueError('The walking service could not calculate this stop order. Try again; no straight-line estimate has been substituted.');
  } finally {
    clearTimeout(timeout); signal?.removeEventListener('abort', abort);
  }
}