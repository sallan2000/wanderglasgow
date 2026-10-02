import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const temporary = await mkdtemp(join(tmpdir(), 'glasgow-planner-'));
try {
  for (const name of ['tours', 'attractions', 'walk-planner']) {
    const source = await readFile(resolve('src', `${name}.ts`), 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText.replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'");
    await writeFile(join(temporary, `${name}.mjs`), output);
  }
  const { findEfficientOrder, planAttractionWalk } =
    await import(pathToFileURL(join(temporary, 'walk-planner.mjs')).href);
  const { attractions } = await import(pathToFileURL(join(temporary, 'attractions.mjs')).href);
  assert.equal(new Set(attractions.map(item => item.id)).size, attractions.length);
  assert.equal(attractions.filter(item => item.name === 'Celtic Park').length, 1);

  const bruteForce = (matrix, limit, budget) => {
    let best = { count: 0, distance: 0 };
    const visit = (last, remaining, count, distance) => {
      if (count > best.count || (count === best.count && distance < best.distance)) best = { count, distance };
      if (count === limit) return;
      for (const next of remaining) {
        const leg = matrix[last][next];
        if (leg !== null && distance + leg <= budget) {
          visit(next, remaining.filter(index => index !== next), count + 1, distance + leg);
        }
      }
    };
    visit(0, Array.from({ length: matrix.length - 1 }, (_, index) => index + 1), 0, 0);
    return best;
  };
  let seed = 1984;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let run = 0; run < 60; run++) {
    const matrix = Array.from({ length: 6 }, (_, from) =>
      Array.from({ length: 6 }, (_, to) => from === to ? 0 : random() < .13 ? null : 10 + Math.floor(random() * 150)));
    const limit = 1 + run % 5;
    const budget = 25 + run * 9;
    const expected = bruteForce(matrix, limit, budget);
    const actual = findEfficientOrder(matrix, limit, budget);
    assert.equal(actual.order.length, expected.count, `Maximum feasible stop count, case ${run}`);
    assert.equal(actual.distanceMeters, expected.distance, `Shortest directed open path, case ${run}`);
    assert.equal(new Set(actual.order).size, actual.order.length, 'No duplicate attractions');
    let last = 0, measured = 0;
    for (const next of actual.order) { measured += matrix[last][next]; last = next; }
    assert.equal(measured, actual.distanceMeters, 'Reconstructed path matches optimum');
  }
  assert.deepEqual(findEfficientOrder([[0, 20], [999, 0]], 1, 100).order, [1], 'No forced return leg');
  assert.equal(findEfficientOrder([[0, null], [20, 0]], 1, 100).order.length, 0);

  const originalFetch = globalThis.fetch;
  let requests = 0, failService = false;
  globalThis.fetch = async url => {
    requests++;
    if (failService) return new Response('Unavailable', { status: 503 });
    const coordinates = new URL(url).pathname.split('/').at(-1).split(';')
      .map(point => point.split(',').map(Number));
    if (String(url).includes('/table/')) {
      const distances = coordinates.map((_, from) => coordinates.map((__, to) =>
        from === to ? 0 : from === 0 ? to === 1 ? null : to === coordinates.length - 1 ? 5000 : 200 + to * 40 : 80));
      return Response.json({ code: 'Ok', distances });
    }
    return Response.json({ code: 'Ok', routes: [{
      distance: 1200, duration: 1000, geometry: { type: 'LineString', coordinates },
    }] });
  };
  try {
    const origin = { lat: 55.8605, lon: -4.2494 };
    const mixed = await planAttractionWalk(origin, { theme: 'All', radiusKm: 2, maxStops: 3 });
    assert.equal(mixed.stops.length, 3);
    assert(mixed.nearby.every(item => item.walkingDistanceMeters <= 2000), 'Walking radius, not straight-line radius');
    assert.equal(mixed.nearby.filter(item => item.included).length, mixed.stops.length);
    assert.equal(mixed.excludedCount, mixed.nearby.length - mixed.stops.length);
    assert.equal(mixed.distanceMeters, 1200, 'Use returned route metrics');
    const themed = await planAttractionWalk(origin, { theme: 'History', radiusKm: 2, maxStops: 3 });
    assert(themed.stops.length > 0 && themed.stops.every(item => item.theme === 'History'));
    const beforeEmpty = requests;
    await assert.rejects(planAttractionWalk({ lat: 0, lon: 0 }, { theme: 'All', radiusKm: 2, maxStops: 3 }),
      error => error.kind === 'empty');
    assert.equal(requests, beforeEmpty, 'No routing request for an out-of-area location');
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(planAttractionWalk(origin, { theme: 'All', radiusKm: 2, maxStops: 3 }, controller.signal),
      error => error.name === 'AbortError');
    failService = true;
    await assert.rejects(planAttractionWalk(origin, { theme: 'All', radiusKm: 2, maxStops: 3 }),
      error => error.kind === 'service' && error.message.includes('no estimated straight-line route'));
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log(`Planner checks passed: 60 exhaustive comparisons, deduplication, budgets, disconnected paths, theme filtering, walking radius, cancellation and service errors.`);
  if (process.argv.includes('--live')) {
    const walk = await planAttractionWalk({ lat: 55.8605, lon: -4.2494 },
      { theme: 'All', radiusKm: 2, maxStops: 6 });
    console.log(JSON.stringify({ liveProvider: 'foot', stops: walk.stops.map(stop => stop.name),
      distanceKm: walk.distanceMeters / 1000, walkingMinutes: Math.ceil(walk.durationSeconds / 60),
      geometryPoints: walk.geometry.coordinates.length }, null, 2));
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}