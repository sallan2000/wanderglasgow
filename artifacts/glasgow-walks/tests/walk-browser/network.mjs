import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { expect } from '@playwright/test';

const require = createRequire(import.meta.url);
const leaflet = await readFile(require.resolve('leaflet/dist/leaflet.js'), 'utf8');
const css = await readFile(require.resolve('leaflet/dist/leaflet.css'), 'utf8');
const transparentTile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDZkAAAAASUVORK5CYII=', 'base64');

// Use real Leaflet rendering and cleanup, adding counters only around lifecycle
// methods. No implementation of a Leaflet API is replaced with a fake.
const instrumentation = `
window.mapFixture = { created: 0, removed: 0, resized: 0, live: [], observed: 0, disconnected: 0 };
const originalMap = L.map;
L.map = (...args) => {
  const m = originalMap(...args);
  mapFixture.created++; mapFixture.live.push(m);
  const remove = m.remove, invalidate = m.invalidateSize;
  m.remove = function(...a) {
    mapFixture.removed++; mapFixture.live = mapFixture.live.filter(x => x !== m);
    return remove.apply(this, a);
  };
  m.invalidateSize = function(...a) { mapFixture.resized++; return invalidate.apply(this, a); };
  return m;
};
`;

export async function isolate(page, options = {}) {
  const unexpected = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    // Track actual ResizeObserver ownership before Leaflet is available.
    window.observerFixture = { observed: 0, disconnected: 0, live: 0 };
    const Observer = window.ResizeObserver;
    window.ResizeObserver = class extends Observer {
      observe(...args) { observerFixture.observed++; observerFixture.live++; super.observe(...args); }
      disconnect() { observerFixture.disconnected++; observerFixture.live--; super.disconnect(); }
    };
    navigator.geolocation.getCurrentPosition = () => { throw new Error('Preview must not request location'); };
  });
  let scriptRequests = 0;
  let cssRequests = 0;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' && url.port === '4179') {
      if (route.request().method() !== 'GET') {
        unexpected.push(route.request().method() + ' ' + url.pathname);
        return route.abort();
      }
      return route.continue();
    }
    if (url.href === 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js') {
      scriptRequests++;
      if (options.holdFirst && scriptRequests === 1) {
        options.releaseScript = () => route.fulfill({ contentType: 'text/javascript', body: leaflet + instrumentation });
        return;
      }
      if (options.timeoutFirst && scriptRequests === 1) {
        options.releaseScript = () => route.abort();
        return; // Deliberately hold until after the loader times out.
      }
      return route.fulfill({ contentType: 'text/javascript', body: leaflet + instrumentation });
    }
    if (url.href === 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css') {
      cssRequests++;
      if (options.cssErrorFirst && cssRequests === 1) return route.abort();
      return route.fulfill({ contentType: 'text/css', body: css });
    }
    if (url.hostname.endsWith('.tile.openstreetmap.org'))
      return options.tileErrors ? route.abort() : route.fulfill({ contentType: 'image/png', body: transparentTile });
    // Fonts are irrelevant to lifecycle assertions and must never go online.
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com')
      return route.fulfill({ contentType: 'text/css', body: '' });
    unexpected.push(url.origin + url.pathname);
    return route.abort();
  });
  return async () => {
    expect(unexpected, 'No remote services or writes may be used').toEqual([]);
    expect(errors, 'No uncaught component/map exceptions').toEqual([]);
    expect(await page.evaluate(() => window.walkFixture.state.saves)).toBe(0);
  };
}

export async function open(page, count = 3) {
  await page.goto(`/tests/walk-browser/index.html?stops=${count}`);
  await expect(page.getByTestId('walk-form')).toBeVisible();
}
export async function preview(page) {
  await page.getByTestId('walk-button-preview').click();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(
    await page.getByTestId('walk-list-stops').locator(':scope > li').count(),
  );
}
export async function measure(page, index = 0, km = 2.4, min = 32) {
  // Opening preview automatically measures unmeasured walks.
  if (await page.evaluate(() => window.walkFixture.state.requests.length) === index)
    await page.getByTestId('walk-button-measure').click();
  await expect.poll(() => page.evaluate(() => window.walkFixture.state.requests.length)).toBe(index + 1);
  await page.evaluate(([i, d, m]) => window.walkFixture.complete(i, d, m), [index, km, min]);
  await expect(page.getByTestId('walk-status-metrics')).toContainText(`${km.toFixed(1)} km · ${min} min`);
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(1);
}

export async function firstRouteCoordinate(page) {
  return page.evaluate(() => {
    let coordinates;
    window.mapFixture.live[0].eachLayer(layer => {
      const json = layer.toGeoJSON?.();
      if (json?.type === 'FeatureCollection') {
        const line = json.features.find(feature => feature.geometry?.type === 'LineString');
        if (line) coordinates = line.geometry.coordinates[0];
      }
    });
    return coordinates;
  });
}