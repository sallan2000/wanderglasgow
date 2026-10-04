import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { expect } from '@playwright/test';

const require = createRequire(import.meta.url);
const leaflet = await readFile(require.resolve('leaflet/dist/leaflet.js'), 'utf8');
const leafletCss = await readFile(require.resolve('leaflet/dist/leaflet.css'), 'utf8');
const transparentTile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDZkAAAAASUVORK5CYII=', 'base64');

const instrumentation = (failMapFirst = false) => `
window.mapFixture = { created: 0, removed: 0, resized: 0, live: [], failMapFirst: ${failMapFirst} };
const originalMap = L.map;
L.map = (...args) => {
  const map = originalMap(...args);
  mapFixture.created++;
  mapFixture.live.push(map);
  const remove = map.remove, invalidateSize = map.invalidateSize, setView = map.setView;
  map.remove = function(...values) {
    mapFixture.removed++;
    mapFixture.live = mapFixture.live.filter(item => item !== map);
    return remove.apply(this, values);
  };
  map.invalidateSize = function(...values) {
    mapFixture.resized++;
    return invalidateSize.apply(this, values);
  };
  map.setView = function(...values) {
    if (mapFixture.failMapFirst) {
      mapFixture.failMapFirst = false;
      throw new Error('Map initialization failed in fixture');
    }
    return setView.apply(this, values);
  };
  return map;
};
`;

export async function isolateMaps(page, options = {}) {
  const unexpected = [];
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(({ denyGeolocation, geolocationErrorCode, failAfterPreviewObserve }) => {
    window.geolocationFixture = { requests: [] };
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(success, error, options) {
          geolocationFixture.requests.push({ options });
          queueMicrotask(() => {
            if (denyGeolocation) error({ code: 1, message: 'User denied Geolocation' });
            else if (geolocationErrorCode !== null) error({
              code: geolocationErrorCode,
              message: geolocationErrorCode === 2 ? 'Position unavailable' : 'Geolocation timed out',
            });
            else success({ coords: { latitude: 55.8642, longitude: -4.2518 } });
          });
        },
      },
    });
    window.observerFixture = {
      observed: 0,
      disconnected: 0,
      live: 0,
      observedTargets: [],
      failAfterPreviewObserve,
    };
    const NativeResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class extends NativeResizeObserver {
      observe(target, ...args) {
        observerFixture.observed++;
        observerFixture.live++;
        observerFixture.observedTargets.push(target?.getAttribute?.('data-testid') ?? target?.className ?? 'unknown');
        const result = super.observe(target, ...args);
        if (observerFixture.failAfterPreviewObserve && target?.getAttribute?.('data-testid') === 'walk-map-preview') {
          observerFixture.failAfterPreviewObserve = false;
          throw new Error('Injected failure after observing the walk preview');
        }
        return result;
      }
      disconnect(...args) {
        observerFixture.disconnected++;
        observerFixture.live--;
        return super.disconnect(...args);
      }
    };
  }, {
    denyGeolocation: options.denyGeolocation === true,
    geolocationErrorCode: options.geolocationErrorCode ?? null,
    failAfterPreviewObserve: options.failAfterPreviewObserve === true,
  });

  let scriptRequests = 0;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' && url.port === '4179') {
      if (route.request().method() !== 'GET') {
        unexpected.push(`${route.request().method()} ${url.pathname}`);
        return route.abort();
      }
      return route.continue();
    }
    if (url.href === 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js') {
      scriptRequests++;
      if (options.holdFirst && scriptRequests === 1) {
        options.releaseScript = () => route.fulfill({ contentType: 'text/javascript', body: leaflet + instrumentation(options.failMapFirst) });
        return;
      }
      if (options.failFirst && scriptRequests === 1) return route.abort();
      return route.fulfill({ contentType: 'text/javascript', body: leaflet + instrumentation(options.failMapFirst) });
    }
    if (url.href === 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css')
      return route.fulfill({ contentType: 'text/css', body: leafletCss });
    if (url.hostname.endsWith('.tile.openstreetmap.org')) {
      if (options.failTileRequests) return route.abort();
      return route.fulfill({ contentType: 'image/png', body: transparentTile });
    }
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com')
      return route.fulfill({ contentType: 'text/css', body: '' });
    unexpected.push(url.origin + url.pathname);
    return route.abort();
  });

  return async ({ geolocationRequests = 0 } = {}) => {
    expect(unexpected, 'Map fixtures must not contact external services or write to the server').toEqual([]);
    expect(pageErrors, 'Map fixtures must not produce uncaught browser errors').toEqual([]);
    expect(await page.evaluate(() => geolocationFixture.requests.length)).toBe(geolocationRequests);
  };
}

export async function openMapFixture(page, component) {
  await page.goto(`/tests/walk-browser/map-fixture.html?component=${component}`, { waitUntil: 'domcontentloaded' });
}

export async function planWithCentre(page) {
  await planAtCentre(page);
  await expect(page.locator('.leaflet-container')).toBeVisible();
}

export async function planAtCentre(page) {
  await page.getByTestId('button-mode-nearby').click();
  await page.getByTestId('button-start-centre').click();
  await page.getByTestId('button-plan-route').click();
  await expect(page.getByTestId('result-plan')).toBeVisible();
}

export async function markerCoordinates(page) {
  return page.evaluate(() => {
    const map = window.mapFixture.live[0];
    let point;
    map.eachLayer(layer => {
      if (typeof layer.getLatLng === 'function') {
        const current = layer.getLatLng();
        point = [current.lat, current.lng];
      }
    });
    return point;
  });
}