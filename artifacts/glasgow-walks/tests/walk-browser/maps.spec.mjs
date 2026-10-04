import { test, expect } from '@playwright/test';
import { isolateMaps, openMapFixture, planAtCentre, planWithCentre, markerCoordinates } from './maps-network.mjs';
import { readFile } from 'node:fs/promises';

test('supplied production policy blocks inline scripts and eval while allowing integrity-checked maps', async ({ page }) => {
  const verify = await isolateMaps(page);
  const policy = await readFile(new URL('../../public/_headers', import.meta.url), 'utf8');
  const headers = Object.fromEntries(policy.split('\n').filter(line => /^  [A-Z]/.test(line)).map(line => {
    const split = line.indexOf(':');
    return [line.slice(0, split).trim(), line.slice(split + 1).trim()];
  }));
  await page.route('**/tests/walk-browser/security-policy.html', route => route.fulfill({
    contentType: 'text/html', headers, body: '<div id="security-result">waiting</div><script>window.inlineAttack=true</script><script type="module" src="/tests/walk-browser/security-module.js"></script>',
  }));
  await page.route('**/tests/walk-browser/security-module.js', route => route.fulfill({
    contentType: 'text/javascript', body: `
      import { loadLeaflet } from '/src/browser-helpers.ts';
      const result = document.getElementById('security-result');
      try { eval('window.evalAttack = true'); } catch { result.dataset.evalBlocked = 'true'; }
      await loadLeaflet();
      result.textContent = 'trusted library ready';
    `,
  }));
  await page.goto('/tests/walk-browser/security-policy.html');
  await expect(page.locator('#security-result')).toHaveText('trusted library ready');
  await expect(page.locator('#security-result')).toHaveAttribute('data-eval-blocked', 'true');
  expect(await page.evaluate(() => Boolean(window.inlineAttack || window.evalAttack))).toBe(false);
  await verify();
});

async function fireTileErrorAndClickRetry(page, tiles, noticeTestId, retryTestId) {
  return page.evaluate(([layer, noticeId, retryId]) => new Promise(resolve => {
    const selector = `[data-testid="${noticeId}"]`;
    const retrySelector = `[data-testid="${retryId}"]`;
    const observer = new MutationObserver(check);
    const timeout = setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, 3000);
    function check() {
      const notice = document.querySelector(selector);
      const button = notice?.querySelector(retrySelector);
      if (!button) return;
      observer.disconnect();
      clearTimeout(timeout);
      const visible = notice.getClientRects().length > 0;
      button.click();
      resolve(visible);
    }
    observer.observe(document.body, { childList: true, subtree: true });
    layer.fire('tileerror');
    check();
  }), [tiles, noticeTestId, retryTestId]);
}

for (const component of ['planner', 'admin']) {
  test(`${component} rejects a tampered CDN library without executing it and retries only trusted bytes`, async ({ page }) => {
    const verify = await isolateMaps(page, { tamperFirst: true });
    await openMapFixture(page, component);
    if (component === 'planner') await planAtCentre(page);
    await expect(page.getByTestId(component === 'planner' ? 'status-plan-map-error' : 'status-map-error'))
      .toContainText('The map library or styles could not load');
    expect(await page.evaluate(() => window.tamperedLibraryExecuted ?? false)).toBe(false);
    expect(await page.evaluate(() => window.L ?? null)).toBeNull();
    await page.getByTestId(component === 'planner' ? 'button-plan-map-retry' : 'button-map-retry').click();
    await expect(page.locator('.leaflet-container')).toBeVisible();
    expect(await page.evaluate(() => window.tamperedLibraryExecuted ?? false)).toBe(false);
    await verify();
  });

  test(`${component} map reports library failure and retries with a fresh map`, async ({ page }) => {
    const verify = await isolateMaps(page, { failFirst: true });
    await openMapFixture(page, component);
    if (component === 'planner') await planAtCentre(page);
    await expect(page.getByTestId(component === 'planner' ? 'status-plan-map-error' : 'status-map-error'))
      .toContainText('The map library or styles could not load');
    expect(await page.evaluate(() => window.mapFixture?.created ?? 0)).toBe(0);
    await page.getByTestId(component === 'planner' ? 'button-plan-map-retry' : 'button-map-retry').click();
    await expect(page.locator('.leaflet-container')).toBeVisible();
    expect(await page.evaluate(() => window.mapFixture.created)).toBe(1);
    await verify();
  });

  test(`${component} map can unmount while Leaflet is loading without creating a stale map`, async ({ page }) => {
    const options = { holdFirst: true };
    const verify = await isolateMaps(page, options);
    await openMapFixture(page, component);
    if (component === 'planner') {
      await planAtCentre(page);
      await expect(page.getByTestId('status-plan-map-loading')).toBeVisible();
    } else {
      await expect(page.getByText('Loading map…', { exact: true })).toBeVisible();
    }
    await page.getByTestId('fixture-toggle-mount').click();
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
    options.releaseScript();
    await expect.poll(() => page.evaluate(() => Boolean(window.L))).toBe(true);
    await expect.poll(() => page.evaluate(() => window.mapFixture.created)).toBe(0);
    expect(await page.evaluate(() => window.mapFixture.live.length)).toBe(0);
    await verify();
  });

  test(`${component} map invalidates its size after the viewport changes`, async ({ page }) => {
    const verify = await isolateMaps(page);
    await openMapFixture(page, component);
    if (component === 'planner') await planWithCentre(page);
    else await expect(page.locator('.leaflet-container')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.mapFixture.resized)).toBeGreaterThan(0);
    const beforeResize = await page.evaluate(() => window.mapFixture.resized);
    await page.setViewportSize({ width: 640, height: 820 });
    if (component === 'planner')
      await expect(page.locator('[data-testid="map-plan"]')).toHaveCSS('height', '340px');
    await expect.poll(() => page.evaluate(() => window.mapFixture.resized)).toBeGreaterThan(beforeResize);
    await verify();
  });
}

test('admin marker follows current coordinates and map clicks use the current callback', async ({ page }) => {
  const verify = await isolateMaps(page);
  await openMapFixture(page, 'admin');
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect.poll(() => markerCoordinates(page)).toEqual([55.86, -4.25]);

  await page.getByTestId('fixture-move-marker').click();
  await expect.poll(() => markerCoordinates(page)).toEqual([55.875, -4.29]);
  await page.getByTestId('fixture-update-label').click();
  await expect.poll(() => page.evaluate(() => {
    let marker;
    window.mapFixture.live[0].eachLayer(layer => {
      if (typeof layer.getLatLng === 'function') marker = layer;
    });
    return marker?.getTooltip()?.getContent()?.textContent;
  })).toBe('Updated museum fixture');

  await page.getByTestId('fixture-update-handler').click();
  await page.evaluate(() => window.mapFixture.live[0].fire('click', {
    latlng: { lat: 55.87, lng: -4.28 },
  }));
  await expect(page.getByTestId('fixture-picked')).toHaveText('2:55.870000,-4.280000');
  await verify();
});

test('admin can place and edit a pin while background tiles fail and recover', async ({ page }) => {
  const options = {};
  const verify = await isolateMaps(page, options);
  await openMapFixture(page, 'admin');
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect.poll(() => markerCoordinates(page)).toEqual([55.86, -4.25]);
  await expect.poll(() => page.evaluate(() => {
    let tiles;
    window.mapFixture.live[0].eachLayer(layer => { if (layer._url) tiles = layer; });
    return Boolean(tiles) && !tiles._loading;
  })).toBe(true);

  const map = await page.evaluateHandle(() => window.mapFixture.live[0]);
  const marker = await page.evaluateHandle(() => {
    let pin;
    window.mapFixture.live[0].eachLayer(layer => {
      if (typeof layer.getLatLng === 'function') pin = layer;
    });
    return pin;
  });
  const tiles = await page.evaluateHandle(() => {
    let background;
    window.mapFixture.live[0].eachLayer(layer => { if (layer._url) background = layer; });
    return background;
  });
  await page.evaluate(layer => {
    const redraw = layer.redraw.bind(layer);
    layer.redrawCalls = 0;
    layer.observedTileErrors = 0;
    layer.on('tileerror', () => { layer.observedTileErrors++; });
    layer.redraw = function(...args) {
      this.redrawCalls++;
      return redraw(...args);
    };
  }, tiles);
  options.failTileRequests = true;
  await page.evaluate(layer => layer.fire('tileerror'), tiles);
  const notice = page.getByTestId('status-picker-map-tiles-error');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Your selected pin and coordinates are unchanged.');

  // Pin placement remains available even though the background warning is shown.
  await page.evaluate(() => window.mapFixture.live[0].fire('click', {
    latlng: { lat: 55.87123456, lng: -4.28123456 },
  }));
  await expect(page.getByTestId('fixture-picked')).toHaveText('1:55.871235,-4.281235');
  await expect(page.getByTestId('fixture-input-latitude')).toHaveValue('55.871235');
  await expect(page.getByTestId('fixture-input-longitude')).toHaveValue('-4.281235');
  await expect.poll(() => markerCoordinates(page)).toEqual([55.871235, -4.281235]);

  // Manual coordinates also update the selected pin while tiles are unavailable.
  await page.getByTestId('fixture-input-latitude').fill('55.88');
  await page.getByTestId('fixture-input-longitude').fill('-4.27');
  await expect.poll(() => markerCoordinates(page)).toEqual([55.88, -4.27]);
  await expect(notice).toBeVisible();
  await expect.poll(() => page.evaluate(layer => layer.observedTileErrors, tiles)).toBeGreaterThan(1);

  options.failTileRequests = false;
  await page.getByTestId('button-picker-map-tiles-retry').click();
  await expect.poll(() => page.evaluate(layer => layer.redrawCalls, tiles)).toBe(1);
  await expect(notice).toHaveCount(0);
  await expect(page.getByTestId('fixture-input-latitude')).toHaveValue('55.88');
  await expect(page.getByTestId('fixture-input-longitude')).toHaveValue('-4.27');
  await expect.poll(() => markerCoordinates(page)).toEqual([55.88, -4.27]);
  expect(await page.evaluate(([activeMap, activePin]) => ({
    sameMap: window.mapFixture.live[0] === activeMap,
    samePin: (() => {
      let pin;
      window.mapFixture.live[0].eachLayer(layer => {
        if (typeof layer.getLatLng === 'function') pin = layer;
      });
      return pin === activePin;
    })(),
    created: window.mapFixture.created,
    removed: window.mapFixture.removed,
  }), [map, marker])).toEqual({ sameMap: true, samePin: true, created: 1, removed: 0 });
  await verify();
});

test('walk preview identifies a Leaflet load failure and retries library loading', async ({ page }) => {
  const verify = await isolateMaps(page, { failFirst: true });
  await openMapFixture(page, 'walk-preview');
  await expect(page.getByTestId('walk-status-map-error')).toContainText('Leaflet could not load');
  await expect(page.getByTestId('walk-status-map-error')).toHaveAttribute('data-failure', 'leaflet');
  expect(await page.evaluate(() => window.mapFixture?.created ?? 0)).toBe(0);

  await page.getByRole('button', { name: 'Retry loading Leaflet' }).click();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.getByTestId('walk-status-map-error')).toHaveCount(0);
  expect(await page.evaluate(() => window.mapFixture.created)).toBe(1);
  await verify();
});

test('walk preview identifies map initialization failure and retries map creation', async ({ page }) => {
  const verify = await isolateMaps(page, { failAfterPreviewObserve: true });
  await openMapFixture(page, 'walk-preview');
  await expect(page.getByTestId('walk-status-map-error')).toContainText('Leaflet loaded, but the preview map could not be initialized');
  await expect(page.getByTestId('walk-status-map-error')).toHaveAttribute('data-failure', 'initialization');
  expect(await page.evaluate(() => window.mapFixture.created)).toBe(1);
  expect(await page.evaluate(() => window.mapFixture.removed)).toBe(1);
  expect(await page.evaluate(() => window.mapFixture.live.length)).toBe(0);
  expect(await page.evaluate(() => window.observerFixture.observedTargets)).toEqual(['walk-map-preview']);
  expect(await page.evaluate(() => window.observerFixture.observed)).toBe(1);
  expect(await page.evaluate(() => window.observerFixture.disconnected)).toBe(1);
  expect(await page.evaluate(() => window.observerFixture.live)).toBe(0);

  await page.getByRole('button', { name: 'Retry map initialization' }).click();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.getByTestId('walk-status-map-error')).toHaveCount(0);
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(2);
  expect(await page.evaluate(() => window.mapFixture.created)).toBe(2);
  expect(await page.evaluate(() => window.mapFixture.removed)).toBe(1);
  expect(await page.evaluate(() => window.mapFixture.live.length)).toBe(1);
  expect(await page.evaluate(() => window.observerFixture.observed)).toBe(2);
  expect(await page.evaluate(() => window.observerFixture.disconnected)).toBe(1);
  expect(await page.evaluate(() => window.observerFixture.live)).toBe(1);
  await verify();
});

for (const failure of [
  {
    name: 'Leaflet load failure',
    options: { failFirst: true },
    type: 'leaflet',
    message: 'Leaflet could not load',
  },
  {
    name: 'map initialization failure',
    options: { failMapFirst: true },
    type: 'initialization',
    message: 'preview map could not be initialized',
  },
]) {
  test(`walk editor stays usable and saves a draft after ${failure.name}`, async ({ page }) => {
    const verify = await isolateMaps(page, failure.options);
    await page.goto('/tests/walk-browser/index.html?allowSave=true&stops=3');
    await expect(page.getByTestId('walk-form')).toBeVisible();

    await page.getByTestId('walk-button-preview').click();
    await expect(page.getByTestId('walk-status-map-error'))
      .toContainText(failure.message);
    await expect(page.getByTestId('walk-status-map-error')).toHaveAttribute('data-failure', failure.type);

    await expect(page.getByTestId('walk-list-stops')).toBeVisible();
    await expect(page.getByTestId('walk-input-story-0')).toBeVisible();
    await page.getByTestId('walk-input-story-0').fill('An updated story saved despite the map failure.');
    await page.getByTestId('walk-button-down-0').click();
    await expect(page.getByTestId('walk-stop-0')).toContainText('George Square');
    await expect(page.getByTestId('walk-input-story-1'))
      .toHaveValue('An updated story saved despite the map failure.');

    const saveButton = page.getByTestId('walk-button-save-draft');
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(page.getByTestId('walk-overlay-editor')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.walkFixture.state.saves)).toBe(1);
    const saved = await page.evaluate(() => window.walkFixture.state.savedWalk);
    expect(saved.published).toBe(false);
    expect(saved.stops[0].name).toBe('George Square');
    expect(saved.stops[1].story).toBe('An updated story saved despite the map failure.');
    await verify();
  });
}

for (const failure of [
  {
    name: 'Leaflet load failure',
    options: { failFirst: true },
    type: 'leaflet',
    message: 'Leaflet could not load',
  },
  {
    name: 'map initialization failure',
    options: { failMapFirst: true },
    type: 'initialization',
    message: 'preview map could not be initialized',
  },
]) {
  test(`walk editor publishes after successful route measurement despite ${failure.name}`, async ({ page }) => {
    const verify = await isolateMaps(page, failure.options);
    await page.goto('/tests/walk-browser/index.html?allowSave=true&stops=3');
    await expect(page.getByTestId('walk-form')).toBeVisible();

    await page.getByTestId('walk-button-preview').click();
    await expect(page.getByTestId('walk-status-map-error'))
      .toContainText(failure.message);
    await expect(page.getByTestId('walk-status-map-error')).toHaveAttribute('data-failure', failure.type);
    await expect.poll(() => page.evaluate(() => window.walkFixture.state.requests.length)).toBe(1);

    // Route measurement is independent of the optional map preview.
    await page.evaluate(() => window.walkFixture.complete(0, 4.2, 57));
    await expect(page.getByTestId('walk-status-metrics')).toContainText('4.2 km · 57 min');
    await expect(page.getByTestId('walk-status-map-error')).toBeVisible();
    expect(await page.evaluate(() => window.mapFixture?.live.length ?? 0)).toBe(0);
    await expect(page.locator('.leaflet-control-zoom-in, .leaflet-marker-icon')).toHaveCount(0);

    await page.getByTestId('walk-button-publish').click();
    await expect(page.getByTestId('walk-overlay-editor')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.walkFixture.state.saves)).toBe(1);
    const saved = await page.evaluate(() => window.walkFixture.state.savedWalk);
    expect(saved).toMatchObject({
      published: true,
      distanceKm: 4.2,
      minutes: 57,
    });
    await verify();
  });
}

test('walk editor keeps walk and story edits after a failed draft save and saves them on retry', async ({ page }) => {
  const verify = await isolateMaps(page);
  await page.goto('/tests/walk-browser/index.html?allowSave=true&stops=3');
  await expect(page.getByTestId('walk-form')).toBeVisible();

  await page.getByTestId('walk-input-title').fill('Revised Glasgow walk');
  await page.getByTestId('walk-input-subtitle').fill('A revised description for this walk.');
  await page.getByTestId('walk-input-story-0').fill('A newly written story for Glasgow Cathedral.');
  await page.getByTestId('walk-input-story-1').fill('A newly written story for George Square.');
  await page.getByTestId('walk-button-down-0').click();
  await expect(page.getByTestId('walk-stop-0')).toContainText('George Square');
  await expect(page.getByTestId('walk-stop-1')).toContainText('Cathedral');
  await page.evaluate(() => window.walkFixture.failNextSave());

  await page.getByTestId('walk-button-save-draft').click();
  await expect(page.getByTestId('walk-status-save-error'))
    .toContainText('Your changes are still here; try again.');
  await expect(page.getByTestId('walk-overlay-editor')).toBeVisible();
  await expect(page.getByTestId('walk-input-title')).toHaveValue('Revised Glasgow walk');
  await expect(page.getByTestId('walk-input-subtitle')).toHaveValue('A revised description for this walk.');
  await expect(page.getByTestId('walk-stop-0')).toContainText('George Square');
  await expect(page.getByTestId('walk-stop-1')).toContainText('Cathedral');
  await expect(page.getByTestId('walk-input-story-0'))
    .toHaveValue('A newly written story for George Square.');
  await expect(page.getByTestId('walk-input-story-1'))
    .toHaveValue('A newly written story for Glasgow Cathedral.');

  await page.getByTestId('walk-button-save-draft').click();
  await expect(page.getByTestId('walk-overlay-editor')).toHaveCount(0);
  const { saves, saveInputs, savedWalk } = await page.evaluate(() => window.walkFixture.state);
  expect(saves).toBe(2);
  expect(saveInputs[1]).toMatchObject({
    title: 'Revised Glasgow walk',
    subtitle: 'A revised description for this walk.',
    published: false,
    stops: [
      { name: 'George Square', story: 'A newly written story for George Square.' },
      { name: 'Cathedral', story: 'A newly written story for Glasgow Cathedral.' },
      { name: 'Kelvingrove', story: 'An original museum story.' },
    ],
  });
  expect(savedWalk).toMatchObject(saveInputs[1]);
  await verify();
});

test('walk preview ignores a late Leaflet load after closing and works when reopened', async ({ page }) => {
  const options = { holdFirst: true };
  const verify = await isolateMaps(page, options);
  await openMapFixture(page, 'walk-preview');
  await expect(page.getByText('Loading map…', { exact: true })).toBeVisible();

  await page.getByTestId('fixture-toggle-mount').click();
  await expect(page.getByTestId('walk-map-preview')).toHaveCount(0);
  await options.releaseScript();
  await expect.poll(() => page.evaluate(() => Boolean(window.L))).toBe(true);
  expect(await page.evaluate(() => window.mapFixture.created)).toBe(0);
  expect(await page.evaluate(() => window.mapFixture.live.length)).toBe(0);
  expect(await page.evaluate(() => window.observerFixture.observed)).toBe(0);
  expect(await page.evaluate(() => window.observerFixture.live)).toBe(0);

  await page.getByTestId('fixture-toggle-mount').click();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(2);
  expect(await page.evaluate(() => window.mapFixture.created)).toBe(1);
  expect(await page.evaluate(() => window.mapFixture.live.length)).toBe(1);
  expect(await page.evaluate(() => window.observerFixture.observed)).toBe(1);
  expect(await page.evaluate(() => window.observerFixture.live)).toBe(1);
  await verify();
});

test('visitor GPS permission is mocked and requested only after the plan button is pressed', async ({ page }) => {
  const verify = await isolateMaps(page);
  await openMapFixture(page, 'planner');
  expect(await page.evaluate(() => geolocationFixture.requests.length)).toBe(0);
  await page.getByTestId('button-mode-nearby').click();
  expect(await page.evaluate(() => geolocationFixture.requests.length)).toBe(0);
  await page.getByTestId('button-plan-route').click();
  await expect.poll(() => page.evaluate(() => geolocationFixture.requests.length)).toBe(1);
  expect(await page.evaluate(() => geolocationFixture.requests[0].options)).toEqual({
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 0,
  });
  await expect(page.getByTestId('result-plan')).toBeVisible();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await verify({ geolocationRequests: 1 });
});

test('visitor route choices survive tile recovery and ignore errors from a retired tile layer', async ({ page }) => {
  const verify = await isolateMaps(page);
  await openMapFixture(page, 'planner');
  await page.getByTestId('button-mode-theme').click();
  await page.getByTestId('button-theme-history').click();
  await page.getByTestId('button-theme-architecture').click();
  await page.getByTestId('button-radius-3').click();
  await page.getByTestId('button-stops-4').click();
  await page.getByTestId('button-start-centre').click();
  await page.getByTestId('button-plan-route').click();
  await expect(page.getByTestId('result-plan')).toBeVisible();
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => {
    let tiles;
    window.mapFixture.live[0].eachLayer(layer => { if (layer._url) tiles = layer; });
    return Boolean(tiles) && !tiles._loading;
  })).toBe(true);

  const originalMap = await page.evaluateHandle(() => window.mapFixture.live[0]);
  const originalTiles = await page.evaluateHandle(() => {
    let tiles;
    window.mapFixture.live[0].eachLayer(layer => { if (layer._url) tiles = layer; });
    return tiles;
  });
  await page.evaluate(tiles => {
    const redraw = tiles.redraw.bind(tiles);
    tiles.redrawCalls = 0;
    tiles.redraw = function(...args) {
      this.redrawCalls++;
      return redraw(...args);
    };
  }, originalTiles);

  const retryClicked = await fireTileErrorAndClickRetry(
    page, originalTiles, 'status-plan-map-tiles-error', 'button-plan-map-tiles-retry',
  );
  expect(retryClicked, 'The visitor tile warning exposes a usable retry button').toBe(true);
  await expect.poll(() => page.evaluate(tiles => tiles.redrawCalls, originalTiles)).toBe(1);
  await expect(page.getByTestId('status-plan-map-tiles-error')).toHaveCount(0);
  await expect(page.getByTestId('result-plan')).toBeVisible();
  await expect(page.getByTestId('stop-plan-cathedral')).toBeVisible();
  await expect(page.getByTestId('stop-plan-george-square')).toBeVisible();
  await expect(page.getByTestId('button-theme-history')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('button-theme-architecture')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('button-radius-3')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('button-stops-4')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('button-start-centre')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.plannerFixture.planCalls)).toEqual([{
    origin: { lat: 55.8609, lon: -4.2514 },
    options: { theme: ['History', 'Architecture'], radiusKm: 3, maxStops: 4 },
  }]);
  expect(await page.evaluate(() => {
    const map = window.mapFixture.live[0];
    let start;
    let route;
    const stops = [];
    map.eachLayer(layer => {
      if (layer instanceof L.CircleMarker) {
        const point = layer.getLatLng();
        start = [point.lat, point.lng];
      }
      if (layer instanceof L.GeoJSON) {
        route = layer.getLayers()[0].getLatLngs().map(point => [point.lat, point.lng]);
      }
      if (layer instanceof L.Marker) {
        stops.push(layer.getTooltip()?.getContent()?.textContent);
      }
    });
    return { start, route, stops };
  })).toEqual({
    start: [55.8609, -4.2514],
    route: [[55.8609, -4.2514], [55.862, -4.234], [55.86, -4.25]],
    stops: ['1. Glasgow Cathedral', '2. George Square'],
  });
  expect(await page.evaluate(map => window.mapFixture.live[0] === map, originalMap)).toBe(true);
  expect(await page.evaluate(() => window.mapFixture.created)).toBe(1);
  expect(await page.evaluate(() => window.mapFixture.removed)).toBe(0);

  // Replanning replaces the map and its tile layer while keeping the visitor's
  // category and starting-point choices. An event from the old layer is stale.
  await page.getByTestId('button-radius-4').click();
  await page.getByTestId('button-plan-route').click();
  await expect(page.getByTestId('result-plan')).toBeVisible();
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => window.mapFixture.created)).toBe(2);
  const activeTiles = await page.evaluateHandle(() => {
    let tiles;
    window.mapFixture.live[0].eachLayer(layer => { if (layer._url) tiles = layer; });
    return tiles;
  });
  expect(await page.evaluate(([oldLayer, newLayer]) => oldLayer !== newLayer, [originalTiles, activeTiles])).toBe(true);

  await page.evaluate(tiles => tiles.fire('tileerror'), originalTiles);
  await expect(page.getByTestId('status-plan-map-tiles-error')).toHaveCount(0);
  await expect(page.getByTestId('result-plan')).toBeVisible();
  await expect(page.getByTestId('button-radius-4')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('button-theme-history')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('button-theme-architecture')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('button-start-centre')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.plannerFixture.planCalls.at(-1))).toEqual({
    origin: { lat: 55.8609, lon: -4.2514 },
    options: { theme: ['History', 'Architecture'], radiusKm: 4, maxStops: 4 },
  });

  await page.evaluate(tiles => tiles.fire('tileerror'), activeTiles);
  await expect(page.getByTestId('status-plan-map-tiles-error')).toBeVisible();
  await verify();
});

for (const gpsError of [
  {
    name: 'denying GPS access',
    options: { denyGeolocation: true },
    message: 'Location permission was declined. Nothing was saved.',
  },
  {
    name: 'an unavailable position',
    options: { geolocationErrorCode: 2 },
    message: 'Your position could not be found. Pick a Glasgow starting point instead.',
  },
  {
    name: 'a timed-out position',
    options: { geolocationErrorCode: 3 },
    message: 'Your position could not be found. Pick a Glasgow starting point instead.',
  },
]) {
  test(`visitor can use a fixed start after ${gpsError.name} without losing walk options`, async ({ page }) => {
    const verify = await isolateMaps(page, gpsError.options);
    await openMapFixture(page, 'planner');
    await page.getByTestId('button-mode-theme').click();
    await page.getByTestId('button-theme-history').click();
    await page.getByTestId('button-theme-architecture').click();
    await page.getByTestId('button-radius-3').click();
    await page.getByTestId('button-stops-4').click();
    expect(await page.evaluate(() => geolocationFixture.requests.length)).toBe(0);

    await page.getByTestId('button-plan-route').click();
    await expect(page.getByTestId('status-planner-error'))
      .toContainText(gpsError.message);
    await expect(page.getByTestId('button-theme-history')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('button-theme-architecture')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('button-radius-3')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('button-stops-4')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => geolocationFixture.requests.length)).toBe(1);

    await page.getByTestId('button-start-centre').click();
    await expect(page.getByTestId('button-start-centre')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('button-plan-route').click();
    await expect(page.getByTestId('result-plan')).toBeVisible();
    await expect(page.locator('.leaflet-container')).toBeVisible();
    expect(await page.evaluate(() => geolocationFixture.requests.length)).toBe(1);
    expect(await page.evaluate(() => plannerFixture.planCalls)).toEqual([{
      origin: { lat: 55.8609, lon: -4.2514 },
      options: { theme: ['History', 'Architecture'], radiusKm: 3, maxStops: 4 },
    }]);
    await verify({ geolocationRequests: 1 });
  });
}