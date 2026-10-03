import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = await mkdtemp(join(tmpdir(), 'curated-walks-'));
try {
  for (const name of ['tours', 'walk-validation', 'walk-store']) {
    const source = await readFile(resolve('src', `${name}.ts`), 'utf8');
    await writeFile(join(dir, `${name}.mjs`), ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText.replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'"));
  }
  // Isolated transport stub: no calls to the owner's real Supabase project.
  await writeFile(join(dir, 'attraction-store.mjs'), `
    export class CatalogueError extends Error {}
    export const state = { responses: [], calls: [] };
    export const supabase = { from(table) {
      const calls = [['from', table]]; state.calls.push(calls);
      const query = {};
      for (const name of ['select','order','range','eq','abortSignal','insert','update','delete','single','maybeSingle'])
        query[name] = (...args) => { calls.push([name, ...args]); return query; };
      query.then = (resolve, reject) => Promise.resolve(state.responses.shift()).then(resolve, reject);
      return query;
    } };
  `);
  const load = name => import(pathToFileURL(join(dir, `${name}.mjs`)).href);
  const { validateWalk } = await load('walk-validation');
  const { tours } = await load('tours');
  const { state, CatalogueError } = await load('attraction-store');
  const store = await load('walk-store');
  const input = { ...tours[0], published: true };
  const valid = validateWalk(input);
  assert.equal(valid.stops[0].name, input.stops[0].name);
  assert.equal(valid.title, input.title);
  assert.equal(validateWalk({ ...input, published: false, stops: [], subtitle: '', distanceKm: 0, minutes: 0 }).stops.length, 0);
  for (const patch of [
    { title: 'a' }, { theme: 'All' }, { subtitle: 'short' }, { stops: [] }, { stops: input.stops.slice(0, 1) },
    { stops: Array.from({ length: 31 }, () => input.stops[0]) }, { distanceKm: 0 }, { distanceKm: NaN },
    { minutes: 1.5 }, { published: 'true' }, { stops: [{ ...input.stops[0], lat: 91 }, input.stops[1]] },
    { stops: [{ ...input.stops[0], story: 'short' }, input.stops[1]] },
  ]) assert.throws(() => validateWalk({ ...input, ...patch }));
  const row = { id: 'fixture-walk', title: input.title, subtitle: input.subtitle, theme: input.theme,
    stops: input.stops, distance_km: input.distanceKm, minutes: input.minutes, published: true,
    updated_at: '2026-10-03T10:00:00.123456Z' };
  const respond = response => state.responses.push(response);
  respond({ data: [row], error: null });
  const publicResult = await store.loadPublicWalks();
  assert.equal(publicResult.walks[0].start, input.stops[0].name);
  assert(state.calls.at(-1).some(call => call[0] === 'eq' && call[1] === 'published' && call[2] === true));
  respond({ data: [], error: null });
  assert.deepEqual((await store.loadPublicWalks()).walks, [], 'An intentionally empty published catalogue stays empty');
  respond({ data: null, error: { code: 'PGRST205' } });
  assert.equal((await store.loadPublicWalks()).walks.length, 8, 'Only an explicit not-installed state shows original walks');
  respond({ data: null, error: { code: 'NETWORK' } });
  await assert.rejects(store.loadPublicWalks(), CatalogueError);
  respond({ data: null, error: { code: '42P01' } });
  await assert.rejects(store.listManagedWalks(), store.WalkSetupError);
  respond({ data: row, error: null });
  const saved = await store.saveWalk(valid);
  assert.equal(saved.id, row.id);
  assert.equal(saved.updatedAt, row.updated_at);
  assert(state.calls.at(-1).some(call => call[0] === 'insert' && call[1].stops.length === 4));
  respond({ data: row, error: null });
  await store.saveWalk(valid, saved);
  assert(state.calls.at(-1).some(call => call[0] === 'eq' && call[1] === 'updated_at' && call[2] === row.updated_at));
  respond({ data: null, error: null });
  await assert.rejects(store.saveWalk(valid, saved), /changed or removed/);
  respond({ data: null, error: { code: '23505' } });
  await assert.rejects(store.saveWalk(valid), /already exists/);
  respond({ data: [], error: null });
  await assert.rejects(store.deleteWalk(saved), /no longer have permission/);
  respond({ data: [{ id: row.id }], error: null });
  await store.deleteWalk(saved);
  assert(state.calls.at(-1).some(call => call[0] === 'eq' && call[1] === 'updated_at'));
  const originalFetch = globalThis.fetch;
  try {
    let requested;
    const geometry = { type: 'LineString', coordinates: [[-4.25, 55.86], [-4.251, 55.861], [-4.26, 55.87]] };
    globalThis.fetch = async (url, options) => {
      requested = String(url);
      if (options.signal.aborted) throw new DOMException('Cancelled.', 'AbortError');
      return Response.json({ code: 'Ok', routes: [{ distance: 2876, duration: 1842, geometry }] });
    };
    const metrics = await store.measureCuratedWalk(input.stops);
    assert.deepEqual(metrics, { distanceKm: 2.876, minutes: 31, geometry });
    assert(requested.includes(input.stops.map(s => `${s.lon},${s.lat}`).join(';')), 'Route calculation preserves the chosen stop order');
    assert(requested.includes('overview=full&geometries=geojson'), 'Preview requests full walking-network geometry');
    for (const bad of [undefined, { type: 'Point', coordinates: [-4, 55] },
      { type: 'LineString', coordinates: [[-4, 55]] },
      { type: 'LineString', coordinates: [[-4, 55], [181, 55]] },
      { type: 'LineString', coordinates: [[-4, 55], ['-4', 55]] }]) {
      globalThis.fetch = async () => Response.json({ code: 'Ok', routes: [{ distance: 2876, duration: 1842, geometry: bad }] });
      await assert.rejects(store.measureCuratedWalk(input.stops), /no straight-line estimate/, 'Invalid geometry cannot count as a successful measurement');
    }
    await assert.rejects(store.measureCuratedWalk([{ ...input.stops[0], lat: NaN }, input.stops[1]]), /valid map coordinates/);
    globalThis.fetch = async () => new Response('Unavailable', { status: 503 });
    await assert.rejects(store.measureCuratedWalk(input.stops), /no straight-line estimate/);
    globalThis.fetch = async (_, options) => {
      if (options.signal.aborted) throw new DOMException('Cancelled.', 'AbortError');
      throw new Error('Unexpected request');
    };
    const controller = new AbortController(); controller.abort();
    await assert.rejects(store.measureCuratedWalk(input.stops, controller.signal), error => error.name === 'AbortError');
    globalThis.fetch = (_, options) => new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled.', 'AbortError')), { once: true });
    });
    const inFlight = new AbortController();
    const pending = store.measureCuratedWalk(input.stops, inFlight.signal);
    inFlight.abort();
    await assert.rejects(pending, error => error.name === 'AbortError', 'Stop edits cancel an in-flight routing request');
  } finally { globalThis.fetch = originalFetch; }
  console.log('Curated-walk checks passed: input validation, ordered snapshots, publication queries, setup-only fallback, empty/error states, conflict-safe CRUD, network metrics and geometry, malformed routes and cancellation. No remote database was modified.');
} finally { await rm(dir, { recursive: true, force: true }); }