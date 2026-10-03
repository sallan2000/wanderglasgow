import { test, expect } from '@playwright/test';
import { isolateMaps, openMapFixture, planAtCentre, planWithCentre, markerCoordinates } from './maps-network.mjs';

for (const component of ['planner', 'admin']) {
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
  const verify = await isolateMaps(page, { failMapFirst: true });
  await openMapFixture(page, 'walk-preview');
  await expect(page.getByTestId('walk-status-map-error')).toContainText('Leaflet loaded, but the preview map could not be initialized');
  await expect(page.getByTestId('walk-status-map-error')).toHaveAttribute('data-failure', 'initialization');
  expect(await page.evaluate(() => window.mapFixture.created)).toBe(1);
  expect(await page.evaluate(() => window.mapFixture.removed)).toBe(1);
  expect(await page.evaluate(() => window.mapFixture.live.length)).toBe(0);

  await page.getByRole('button', { name: 'Retry map initialization' }).click();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.getByTestId('walk-status-map-error')).toHaveCount(0);
  expect(await page.evaluate(() => window.mapFixture.created)).toBe(2);
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

test('visitor can use a fixed start after denying GPS without losing walk options', async ({ page }) => {
  const verify = await isolateMaps(page, { denyGeolocation: true });
  await openMapFixture(page, 'planner');
  await page.getByTestId('button-mode-theme').click();
  await page.getByTestId('button-theme-history').click();
  await page.getByTestId('button-theme-architecture').click();
  await page.getByTestId('button-radius-3').click();
  await page.getByTestId('button-stops-4').click();
  expect(await page.evaluate(() => geolocationFixture.requests.length)).toBe(0);

  await page.getByTestId('button-plan-route').click();
  await expect(page.getByTestId('status-planner-error'))
    .toContainText('Location permission was declined. Nothing was saved.');
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