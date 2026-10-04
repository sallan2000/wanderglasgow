import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = await mkdtemp(join(tmpdir(), 'starting-areas-'));
try {
  const source = await readFile('src/starting-area-store.ts', 'utf8');
  await writeFile(join(dir, 'starting-area-store.mjs'), ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace("'./attraction-store'", "'./attraction-store.mjs'"));
  await writeFile(join(dir, 'attraction-store.mjs'), `
    export const state = { responses: [], calls: [] };
    export let supabase = { from(table) {
      const calls = [['from', table]]; state.calls.push(calls);
      const query = {};
      for (const name of ['select','order','range','eq','abortSignal','insert','update','delete','single','maybeSingle'])
        query[name] = (...args) => { calls.push([name, ...args]); return query; };
      query.then = (resolve, reject) => Promise.resolve(state.responses.shift()).then(resolve, reject);
      return query;
    } };
    export function unconfigure() { supabase = null; }
  `);
  const store = await import(pathToFileURL(join(dir, 'starting-area-store.mjs')).href);
  const { state, unconfigure } = await import(pathToFileURL(join(dir, 'attraction-store.mjs')).href);
  const respond = response => state.responses.push(response);
  const row = { id: 'station', name: 'Central Station', latitude: 55.859, longitude: -4.258, updated_at: '2026-10-04T18:00:00.000001Z' };
  const input = { name: ' Central Station ', lat: 55.859, lon: -4.258 };
  assert.equal(store.validateStartingArea(input).name, 'Central Station');
  for (const patch of [{ name: '' }, { name: 'x'.repeat(81) }, { name: ' my location ' }, { lat: NaN }, { lat: 91 }, { lon: -181 }, { lon: Infinity }]) {
    assert.throws(() => store.validateStartingArea({ ...input, ...patch }), store.StartingAreaError);
  }
  respond({ data: [row], error: null });
  assert.deepEqual((await store.loadPublicStartingAreas()).areas[0], { id: row.id, name: row.name, lat: row.latitude, lon: row.longitude, updatedAt: row.updated_at });
  respond({ data: [], error: null });
  assert.deepEqual((await store.loadPublicStartingAreas()).areas, []);
  respond({ data: null, error: { code: 'PGRST205' } });
  const missing = await store.loadPublicStartingAreas();
  assert.equal(missing.areas.length, 3); assert(missing.notice.includes('not been installed'));
  respond({ data: null, error: { code: '42P01' } });
  await assert.rejects(store.listStartingAreas(), store.StartingAreaSetupError);
  respond({ data: null, error: { code: 'NETWORK' } });
  await assert.rejects(store.loadPublicStartingAreas(), store.StartingAreaError);
  respond({ data: [{ ...row, latitude: null }], error: null });
  await assert.rejects(store.loadPublicStartingAreas(), /invalid data/);
  respond({ data: row, error: null });
  const saved = await store.saveStartingArea(input);
  assert(state.calls.at(-1).some(c => c[0] === 'insert' && c[1].name === 'Central Station'));
  respond({ data: row, error: null });
  await store.saveStartingArea(input, saved);
  assert(state.calls.at(-1).some(c => c[0] === 'eq' && c[1] === 'updated_at' && c[2] === row.updated_at));
  respond({ data: null, error: null });
  await assert.rejects(store.saveStartingArea(input, saved), /changed or was removed/);
  for (const [code, message] of [['23505', /already exists/], ['42501', /Permission denied/], ['23514', /valid latitude/]]) {
    respond({ data: null, error: { code } });
    await assert.rejects(store.saveStartingArea(input), message);
  }
  respond({ data: [], error: null });
  await assert.rejects(store.deleteStartingArea(saved), /changed/);
  respond({ data: [{ id: row.id }], error: null });
  await store.deleteStartingArea(saved);
  assert(state.calls.at(-1).some(c => c[0] === 'eq' && c[1] === 'updated_at' && c[2] === row.updated_at));
  const controller = new AbortController(); controller.abort();
  const callsBefore = state.calls.length;
  await assert.rejects(store.listStartingAreas(controller.signal), e => e.name === 'AbortError');
  assert.equal(state.calls.length, callsBefore);
  // Exercise pagination beyond Supabase's standard 1,000-row limit.
  respond({ data: Array.from({ length: 1000 }, (_, i) => ({ ...row, id: `area-${i}` })), error: null });
  respond({ data: [row], error: null });
  assert.equal((await store.listStartingAreas()).length, 1001);
  assert(state.calls.at(-1).some(c => c[0] === 'range' && c[1] === 1000));
  unconfigure();
  assert((await store.loadPublicStartingAreas()).notice.includes('not configured'));
  await assert.rejects(store.listStartingAreas(), /not configured/);
  console.log('Starting-area transport checks passed: validation, public loaded/empty/error/setup states, pagination, conflict-safe CRUD, permissions, and cancellation. No remote requests.');
} finally { await rm(dir, { recursive: true, force: true }); }