import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const temp = await mkdtemp(join(tmpdir(), 'wanderglasgow-route-url-'));
let checks = 0;
const equal = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };

function parseParams(url) {
  const p = new URL(url).searchParams;
  return {
    origin: p.get('saddr') ?? p.get('origin'),
    destination: p.get('daddr') ?? p.get('destination'),
    waypoint: p.get('waypoint') ?? p.get('waypoints'),
    travelmode: p.get('dirflg') ?? p.get('travelmode'),
    googleTravelmode: p.get('travelmode'),
  };
}

try {
  const source = await readFile('src/route-url.ts', 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/from '(\.?\/[^']+)'/g, "from '$1.mjs'");
  await writeFile(join(temp, 'route-url.mjs'), output);
  const { buildNavigationUrls } = await import(pathToFileURL(join(temp, 'route-url.mjs')).href);

  const start = { lat: 55.86, lon: -4.25 };
  const stop = { lat: 55.861, lon: -4.251 };
  const two = [start, stop];

  const out = parseParams(buildNavigationUrls(two).appleMapsUrl);
  equal(out.origin, '55.860000,-4.250000', 'apple: origin as start');
  equal(out.destination, '55.861000,-4.251000', 'apple: destination as end');
  equal(out.waypoint, null, 'apple: no waypoint');
  equal(out.travelmode, 'w', 'apple: walking mode');

  const g = parseParams(buildNavigationUrls(two).googleMapsUrl);
  equal(g.origin, '55.860000,-4.250000', 'google: origin as start');
  equal(g.destination, '55.861000,-4.251000', 'google: destination as end');
  equal(g.waypoint, null, 'google: no waypoint');
  equal(g.googleTravelmode, 'walking', 'google: walking mode');

  const middle = { lat: 55.8605, lon: -4.2505 };
  const three = [start, middle, stop];
  const out3 = parseParams(buildNavigationUrls(three).appleMapsUrl);
  equal(out3.origin, '55.860000,-4.250000', 'apple: origin as start (3 stops)');
  equal(out3.waypoint, '55.860500,-4.250500', 'apple: waypoint inserted before destination');
  const g3 = parseParams(buildNavigationUrls(three).googleMapsUrl);
  equal(g3.origin, '55.860000,-4.250000', 'google: origin as start (3 stops)');
  equal(g3.destination, '55.861000,-4.251000', 'google: destination as end (3 stops)');
  equal(g3.googleTravelmode, 'walking', 'google: walking mode (3 stops)');
  equal(g3.waypoint ?? g3.waypoints, '55.860500,-4.250500', 'google: waypoints appended after travelmode');

  const empty = buildNavigationUrls([start]);
  equal(empty.appleMapsUrl, '', 'apple: fewer than 2 coordinates -> empty');
  equal(empty.googleMapsUrl, '', 'google: fewer than 2 coordinates -> empty');

  const atExtreme = buildNavigationUrls([
    { lat: 55.8642, lon: -4.2518 },
    { lat: 55.8651, lon: -4.256 },
    { lat: 55.864, lon: 4.2518 },
  ]);
  equal(parseParams(atExtreme.appleMapsUrl).origin, '55.864200,-4.251800', 'apple: long/lat formatting');
  equal(parseParams(atExtreme.googleMapsUrl).origin, '55.864200,-4.251800', 'google: long/lat formatting');

  console.log(`Route URL checks passed (${checks}): origin as start, stops in order, last stop as destination, waypoints between.`);
} catch (error) {
  console.error('Route URL checks FAILED');
  throw error;
} finally {
  await rm(temp, { recursive: true, force: true });
}
