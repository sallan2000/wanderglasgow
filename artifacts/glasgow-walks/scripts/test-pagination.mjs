import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';

const dir = await mkdtemp(join(tmpdir(), 'glasgow-pagination-'));
let records = [], requests = [], mode = 'normal', cap = 2;
globalThis.__paginationClient = createClient('https://example.invalid', 'fixture', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (input, options) => {
    const url = new URL(input);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 1000);
    requests.push({ url, options, offset, limit });
    if (mode === 'error' && offset) return Response.json({ code: 'NETWORK', message: 'failure' }, { status: 500 });
    if (offset >= records.length && offset > 0) return Response.json({ code: 'PGRST103', message: 'Requested range not satisfiable' }, { status: 416 });
    const data = mode === 'stalled' ? [] : records.slice(offset, offset + Math.min(limit, cap));
    const range = data.length ? `${offset}-${offset + data.length - 1}/${records.length}` : `*/${records.length}`;
    return Response.json(data, { status: 200, headers: mode === 'no-count' ? {} : { 'content-range': range } });
  } },
});
try {
  for (const name of ['attractions', 'tours', 'access-details', 'walk-validation', 'attraction-store', 'walk-store', 'starting-area-store']) {
    let source = await readFile(`src/${name}.ts`, 'utf8');
    if (name === 'attraction-store') source = source
      .replace("import { createClient } from '@supabase/supabase-js';", 'const createClient = () => globalThis.__paginationClient;')
      .replaceAll('import.meta.env.VITE_SUPABASE_URL', '"https://example.invalid"')
      .replaceAll('import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY', '"fixture"');
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
      .outputText.replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'");
    await writeFile(join(dir, `${name}.mjs`), output);
  }
  const load = name => import(pathToFileURL(join(dir, `${name}.mjs`)).href);
  const catalogue = await load('attraction-store');
  const walks = await load('walk-store');
  const areas = await load('starting-area-store');
  const { tours } = await load('tours');
  const tour = tours[0];
  const fixtures = [
    { name: 'categories', read: signal => catalogue.listAttractionCategories(signal), row: i => ({ name: `Category ${i}` }), field: 'name' },
    { name: 'attractions', read: async signal => (await catalogue.loadPublicCatalogue(signal)).attractions, row: i => ({ id: `id-${i}`, name: `Attraction ${i}`, description: 'Description', place: 'Glasgow', theme: 'History', latitude: 55.86, longitude: -4.25, published: true, updated_at: 'now' }), field: 'id', published: true },
    { name: 'walks', read: async signal => (await walks.loadPublicWalks(signal)).walks, row: i => ({ id: `id-${i}`, title: `Walk ${i}`, subtitle: tour.subtitle, theme: tour.theme, stops: tour.stops, distance_km: tour.distanceKm, minutes: tour.minutes, published: true, updated_at: 'now' }), field: 'id', published: true },
    { name: 'areas', read: signal => areas.listStartingAreas(signal), row: i => ({ id: `id-${i}`, name: `Area ${i}`, latitude: 55.86, longitude: -4.25, updated_at: 'now' }), field: 'id' },
  ];
  for (const fixture of fixtures) {
    for (const size of [0, 1, 4, 5]) {
      records = Array.from({ length: size }, (_, i) => fixture.row(i)); requests = []; mode = 'normal';
      const result = await fixture.read();
      assert.deepEqual(result.map(item => typeof item === 'string' ? item : item[fixture.field]), records.map(item => item[fixture.field]), `${fixture.name}: all rows`);
      assert.deepEqual(requests.map(r => r.offset), size ? Array.from({ length: Math.ceil(size / cap) }, (_, i) => i * cap) : [0], `${fixture.name}: actual offsets and no 416 probe`);
      for (const req of requests) {
        assert.equal(req.options.headers.get('prefer'), 'count=exact');
        if (fixture.published) assert.equal(req.url.searchParams.get('published'), 'eq.true');
      }
    }
    records = Array.from({ length: 5 }, (_, i) => fixture.row(i));
    const controller = new AbortController(); controller.abort(); requests = [];
    await assert.rejects(fixture.read(controller.signal), error => error.name === 'AbortError');
    assert.equal(requests.length, 0, `${fixture.name}: pre-aborted without requests`);
    for (const bad of ['error', 'no-count', 'stalled']) {
      requests = []; mode = bad;
      await assert.rejects(fixture.read(), undefined, `${fixture.name}: ${bad} must not return partial results`);
    }
  }
  console.log('Pagination checks passed: four stores, real Supabase SDK response parsing, server cap 2, empty/exact/partial pages, no 416 probe, missing counts and errors.');
} finally { await rm(dir, { recursive: true, force: true }); delete globalThis.__paginationClient; }
