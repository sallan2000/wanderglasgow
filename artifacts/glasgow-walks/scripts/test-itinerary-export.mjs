import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const temp = await mkdtemp(join(tmpdir(), 'glasgow-itinerary-'));
let checks = 0;
const equal = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
try {
  for (const name of ['access-details', 'itinerary-snapshot', 'itinerary-style', 'itinerary-document']) {
    const source = await readFile(`src/${name}.ts`, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText.replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'");
    await writeFile(join(temp, `${name}.mjs`), output);
  }
  const load = name => import(pathToFileURL(join(temp, `${name}.mjs`)).href);
  const { curatedItinerary, plannedItinerary } = await load('itinerary-snapshot');
  const { itineraryDocument, itineraryFilename } = await load('itinerary-document');
  const stop = { name: '<script>alert("name")</script>', place: 'City & centre', lat: 55.86, lon: -4.25,
    story: '</p><img src="https://evil.invalid" onerror="alert(1)">\nLine two' };
  const originalName = stop.name;
  const tour = { id: 'a', title: 'A & <b>walk</b>', subtitle: 'An editorial walk', theme: 'History', start: 'Listed start',
    stops: [stop, { ...stop, name: 'Second sight', lat: 55.861 }], minutes: 20, distanceKm: 1.25 };
  const geometry = { type: 'LineString', coordinates: [[-4.249, 55.859], [-4.25, 55.86], [-4.25, 55.861]] };
  const plan = { origin: { lat: 55.859, lon: -4.249 }, theme: ['History', 'Art'], distanceMeters: 900,
    durationSeconds: 550, geometry, stops: tour.stops.map((s, i) => ({
      ...s, id: String(i), theme: 'History', description: s.story,
      ...(i ? {} : { access: { stepFree: 'yes', accessibleToilet: 'no', seating: 'unknown', notes: '<iframe src=https://evil.invalid>Owner note</iframe>' } }),
    })) };
  globalThis.fetch = () => { throw new Error('Exports must not fetch.'); };
  const curated = curatedItinerary({ ...tour, geometry, origin: plan.origin });
  equal(curated.geometry, undefined);
  equal(curated.start, { label: 'Listed start', lat: 55.86, lon: -4.25 });
  const planned = plannedItinerary(plan);
  equal(planned.category, 'History, Art');
  geometry.coordinates[0][0] = -4.24;
  plan.stops[0].access.notes = 'Changed later';
  tour.stops[0].name = 'Changed later';
  equal(planned.geometry.coordinates[0][0], -4.249, 'Route coordinates are copied');
  equal(planned.stops[0].access.notes.includes('Owner note'), true);
  equal(curated.stops[0].name, originalName, 'Curated stops are copied');
  const date = new Date('2026-10-04T10:00:00Z');
  const html = itineraryDocument(planned, date);
  equal(html.includes('<script>'), false);
  equal(html.includes('<img '), false);
  equal(html.includes('<iframe '), false);
  equal(html.includes('&lt;script&gt;'), true);
  equal(html.includes('&lt;iframe src=https://evil.invalid&gt;Owner note'), true);
  equal(html.includes('Accessible toilet: No'), true);
  equal(html.includes('Seating / rest point: Unknown'), true);
  equal(html.includes('Attraction access: Unknown'), true);
  equal(html.includes('Paths between sights have not been assessed'), true);
  equal(html.includes('<polyline points='), true);
  equal(html.includes('Route data © OpenStreetMap contributors'), true);
  equal(html.includes('55.859000, -4.249000'), true);
  equal(html.includes('Snapshot prepared 2026-10-04T10:00:00.000Z'), true);
  equal(html.includes('@page { size: A4;'), true);
  equal(/<link|<script|<img|@import|url\(/i.test(html), false, 'No active external resources');
  equal(html.includes('default-src \'none\''), true);
  const editorial = itineraryDocument(curated, date);
  equal(editorial.includes('<svg'), false);
  equal(editorial.includes('Curated walking estimates: 1.25 km'), true);
  equal(editorial.includes('does not include a GPS connection'), true);
  const noGeometry = { ...planned, geometry: undefined };
  equal(itineraryDocument(noGeometry, date).includes('<svg'), false);
  equal(itineraryFilename({ ...planned, title: '../../Å walk?!<script>' }), 'wander-glasgow-a-walk-script.html');
  equal(itineraryFilename({ ...planned, title: '🗺' }), 'wander-glasgow-itinerary.html');
  for (const change of [
    { stops: [] }, { title: undefined }, { start: { ...planned.start, lat: Infinity } },
    { distanceMeters: -1 }, { durationSeconds: NaN },
    { geometry: { type: 'Polygon', coordinates: [] } },
    { geometry: { type: 'LineString', coordinates: [[-4, 55], [NaN, 55]] } },
    { geometry: { type: 'LineString', coordinates: [[-4, 55], [-4, 95]] } },
    { stops: [{ ...planned.stops[0], access: { ...planned.stops[0].access, seating: 'maybe' } }] },
  ]) {
    assert.throws(() => itineraryDocument({ ...planned, ...change }, date)); checks++;
  }
  assert.throws(() => itineraryDocument({ ...curated, geometry: planned.geometry }, date)); checks++;
  const large = { ...curated, stops: Array.from({ length: 30 }, (_, i) => ({
    ...curated.stops[0], name: `Stop ${i + 1}`, story: `Full story ${i + 1}\n${'Long text '.repeat(450)}\nLast line ${i + 1}`,
  })) };
  const long = itineraryDocument(large, date);
  equal(long.includes('30. Stop 30'), true);
  equal(long.includes('Last line 30'), true);
  equal((long.match(/<article class="stop">/g) ?? []).length, 30);
  console.log(`Itinerary export checks passed (${checks}): copied snapshots, escaping, route/curated separation, access unknowns, validation, pagination styles and no network calls.`);
} finally {
  await rm(temp, { recursive: true, force: true });
}