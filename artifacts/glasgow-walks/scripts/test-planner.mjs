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
  const { findEfficientOrder, planAttractionWalk, defaultWalkLimitKm } =
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
  let requests = 0, failService = false, lastTableCoordinates = [], farService = false, routeDistance = 1200;
  globalThis.fetch = async url => {
    requests++;
    if (failService) return new Response('Unavailable', { status: 503 });
    const coordinates = new URL(url).pathname.split('/').at(-1).split(';')
      .map(point => point.split(',').map(Number));
    if (String(url).includes('/table/')) {
      lastTableCoordinates = coordinates;
      const distances = coordinates.map((_, from) => coordinates.map((__, to) =>
        from === to ? 0 : farService ? from === 0 ? to === coordinates.length - 1 ? 10500 : 6200 + to * 500 : 500 :
          from === 0 ? to === 1 ? null : to === coordinates.length - 1 ? 5000 : 200 + to * 40 : 80));
      return Response.json({ code: 'Ok', distances });
    }
    return Response.json({ code: 'Ok', routes: [{
      distance: routeDistance, duration: 1000, geometry: { type: 'LineString', coordinates },
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
    assert.equal(defaultWalkLimitKm(5), 5, 'Existing search options retain a 5 km walking limit');
    assert.equal(defaultWalkLimitKm(10), 15, 'Extended search permits a 15 km walk');
    const farCatalogue = [0.058, 0.060, 0.062, 0.064, 0.11].map((offset, i) => ({
      id: `far-${i}`, name: `Farther attraction ${i}`, description: 'Extended radius check.',
      place: 'Glasgow', theme: i % 2 ? 'Music' : 'Art', lat: origin.lat + offset, lon: origin.lon,
    }));
    const beforeFarSearch = requests;
    await assert.rejects(planAttractionWalk(origin, { theme: ['Art', 'Music'], radiusKm: 5, maxStops: 3 }, undefined, farCatalogue),
      error => error.kind === 'empty', 'The original 5 km search still excludes farther attractions');
    assert.equal(requests, beforeFarSearch);
    farService = true; routeDistance = 7700;
    const farWalk = await planAttractionWalk(origin, { theme: ['Art', 'Music'], radiusKm: 10, maxStops: 3 }, undefined, farCatalogue);
    assert.equal(farWalk.stops.length, 3, '5 km+ can actually build a walk to farther attractions');
    assert(farWalk.stops.some(item => item.theme === 'Art') && farWalk.stops.some(item => item.theme === 'Music'));
    assert.equal(farWalk.distanceMeters, 7700, 'An extended walk is not rejected by the old 5 km total limit');
    assert(farWalk.nearby.every(item => item.walkingDistanceMeters > 5000 && item.walkingDistanceMeters <= 10000), 'Extended radius is still bounded by actual walking distance');
    assert(!farWalk.nearby.some(item => item.id === 'far-3'), 'A sight beyond 10 km on foot is excluded even if closer in a straight line');
    assert.equal(lastTableCoordinates.length, 5, 'Attractions over 10 km in a straight line are excluded before routing');
    await assert.rejects(planAttractionWalk(origin, { theme: ['Art', 'Music'], radiusKm: 10, maxStops: 3, maxWalkKm: 5 }, undefined, farCatalogue),
      error => error.kind === 'empty', 'An explicitly shorter walking budget remains enforced');
    routeDistance = 16000;
    await assert.rejects(planAttractionWalk(origin, { theme: ['Art', 'Music'], radiusKm: 10, maxStops: 3 }, undefined, farCatalogue),
      error => error.kind === 'service', 'The final extended route may not exceed 15 km');
    farService = false; routeDistance = 1200;
    const themed = await planAttractionWalk(origin, { theme: 'History', radiusKm: 2, maxStops: 3 });
    assert(themed.stops.length > 0 && themed.stops.every(item => item.theme === 'History'));
    const unionCatalogue = ['History', 'Art', 'Music', 'Sport', 'Art', 'Music', 'Art', 'Music'].map((theme, i) => ({
      id: `union-${i}`, name: `Selected-category sight ${i}`, description: 'Category filtering check.',
      place: 'Glasgow', theme, lat: origin.lat + (i + 1) * .0001, lon: origin.lon,
    }));
    const combined = await planAttractionWalk(origin, { theme: ['Music', 'Art', 'Art'], radiusKm: 2, maxStops: 3 }, undefined, unionCatalogue);
    assert(combined.stops.some(item => item.theme === 'Art') && combined.stops.some(item => item.theme === 'Music'), 'Music and Art can both appear on one walk');
    assert(combined.stops.every(item => ['Music', 'Art'].includes(item.theme)), 'Non-selected categories never become route stops');
    assert(combined.nearby.every(item => ['Music', 'Art'].includes(item.theme)), 'Non-selected categories are excluded from nearby suggestions and map markers');
    assert.equal(new Set(combined.stops.map(item => item.id)).size, combined.stops.length, 'Repeated categories do not duplicate stops');
    assert.equal(lastTableCoordinates.length, 7, 'Only the six matching attractions and origin are sent for routing');
    assert(lastTableCoordinates.slice(1).every(([lon, lat]) => unionCatalogue.some(item =>
      ['Art', 'Music'].includes(item.theme) && item.lon === lon && item.lat === lat)), 'Routing requests exclude History and Sport coordinates');
    assert.equal(combined.excludedCount, combined.nearby.length - combined.stops.length, 'Excluded count only includes matching nearby attractions');
    const artOnly = await planAttractionWalk(origin, { theme: ['Art'], radiusKm: 2, maxStops: 3 }, undefined, unionCatalogue);
    assert(artOnly.stops.length > 0 && artOnly.nearby.every(item => item.theme === 'Art'), 'Deselecting Music leaves only Art attractions');
    const customUnionCatalogue = unionCatalogue.map(item => ({ ...item, theme: item.theme === 'Music' ? 'Food & drink' : item.theme }));
    const customCombined = await planAttractionWalk(origin, { theme: ['Art', 'Food & drink'], radiusKm: 2, maxStops: 3 }, undefined, customUnionCatalogue);
    assert(customCombined.stops.some(item => item.theme === 'Food & drink') && customCombined.stops.some(item => item.theme === 'Art'), 'New custom categories combine with existing ones');
    assert(customCombined.nearby.every(item => ['Art', 'Food & drink'].includes(item.theme)));
    const beforeInvalidSelection = requests;
    for (const theme of [[], [''], ['Art', ''], ['Art', null]]) {
      await assert.rejects(planAttractionWalk(origin, { theme, radiusKm: 2, maxStops: 3 }, undefined, unionCatalogue),
        error => error.kind === 'location', 'Empty or invalid category selections never mean all categories');
    }
    await assert.rejects(planAttractionWalk(origin, { theme: ['Nature', 'Food & drink'], radiusKm: 2, maxStops: 3 }, undefined, unionCatalogue),
      error => error.kind === 'empty', 'No matches never falls back to unselected categories');
    assert.equal(requests, beforeInvalidSelection, 'Empty, invalid and unmatched selections make no routing requests');
    const liveCatalogue = Array.from({ length: 4 }, (_, i) => ({
      id: `admin-added-${i}`, name: `Admin-added sight ${i}`, description: 'An administrator description.',
      place: 'Glasgow', theme: 'Art', lat: origin.lat + i * .0001, lon: origin.lon,
    }));
    const added = await planAttractionWalk(origin, { theme: 'Art', radiusKm: 2, maxStops: 3 }, undefined, liveCatalogue);
    assert(added.stops.length > 0 && added.stops.every(item => item.id.startsWith('admin-added-')), 'Themed planning consumes supplied live attractions');
    const addedNearby = await planAttractionWalk(origin, { theme: 'All', radiusKm: 2, maxStops: 3 }, undefined, liveCatalogue);
    assert(addedNearby.stops.length > 0 && addedNearby.stops.every(item => item.id.startsWith('admin-added-')), 'Nearby planning consumes supplied live attractions');
    const customCatalogue = liveCatalogue.map(item => ({ ...item, theme: 'Food & drink' }));
    const custom = await planAttractionWalk(origin, { theme: 'Food & drink', radiusKm: 2, maxStops: 3 }, undefined, customCatalogue);
    assert(custom.stops.length > 0 && custom.stops.every(item => item.theme === 'Food & drink'), 'Custom category planning is not restricted to the original four categories');
    const customNearby = await planAttractionWalk(origin, { theme: 'All', radiusKm: 2, maxStops: 3 }, undefined, customCatalogue);
    assert(customNearby.stops.length > 0 && customNearby.stops.every(item => item.theme === 'Food & drink'), 'Nearby planning includes custom-category attractions');
    await assert.rejects(planAttractionWalk(origin, { theme: '', radiusKm: 2, maxStops: 3 }, undefined, customCatalogue),
      error => error.kind === 'location', 'Blank category is rejected');
    await assert.rejects(planAttractionWalk(origin, { theme: 'Nature', radiusKm: 2, maxStops: 3 }, undefined, customCatalogue),
      error => error.kind === 'empty', 'A category with no published matching attractions reports an empty result');
    await assert.rejects(planAttractionWalk(origin, { theme: 'All', radiusKm: 2, maxStops: 3 }, undefined, []),
      error => error.kind === 'empty', 'An empty live catalogue is never silently replaced with seeds');
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
  console.log(`Planner checks passed: 60 exhaustive comparisons, deduplication, budgets, disconnected paths, single/multiple/custom category filtering, deselection, empty selections, standard/extended walking radius, cancellation and service errors.`);
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