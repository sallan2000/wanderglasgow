import { test, expect } from '@playwright/test';
import { isolate, open, preview, measure, firstRouteCoordinate } from './network.mjs';

test('late reorder response cannot replace the new order, metrics or geometry', async ({ page }) => {
  const verify = await isolate(page);
  await open(page); await preview(page); await measure(page);
  await page.getByTestId('walk-button-measure').click();
  await page.getByTestId('walk-button-down-0').click();
  await expect(page.getByTestId('walk-stop-0')).toContainText('George Square');
  await expect(page.locator('.leaflet-marker-icon[title="1. George Square"]')).toHaveCount(1);
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(0);
  expect(await page.evaluate(() => window.walkFixture.state.requests[1].signal.aborted)).toBe(true);
  await measure(page, 2, 3.7, 49);
  await page.evaluate(() => window.walkFixture.complete(1, 99, 999));
  await expect(page.getByTestId('walk-status-metrics')).toContainText('3.7 km · 49 min');
  await expect(page.getByTestId('walk-status-route-preview')).toContainText('3.7 km · 49 min');
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(1);
  expect(await firstRouteCoordinate(page)).toEqual([-4.25, 55.86]);
  expect(await page.evaluate(() => window.walkFixture.state.requests[2].stops[0].name)).toBe('George Square');
  await verify();
});

for (const outcome of ['complete', 'fail']) {
  test(`late ${outcome} after removal cannot restore route or error`, async ({ page }) => {
    const verify = await isolate(page);
    await open(page); await preview(page); await measure(page);
    await page.getByTestId('walk-button-measure').click();
    await page.getByTestId('walk-button-remove-0').click();
    expect(await page.evaluate(() => window.walkFixture.state.requests[1].signal.aborted)).toBe(true);
    await page.evaluate(outcome => window.walkFixture[outcome](1), outcome);
    await expect(page.getByTestId('walk-status-metrics')).toContainText('Not measured for this order');
    await expect(page.getByTestId('walk-status-route-preview')).toContainText('Stops changed');
    await expect(page.locator('.leaflet-marker-icon')).toHaveCount(2);
    await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(0);
    await expect(page.getByTestId('walk-status-save-error')).toHaveCount(0);
    await expect(page.getByTestId('walk-button-measure')).toBeEnabled();
    await verify();
  });
}

test('coordinate-only change clears measured geometry and cancels pending measurement', async ({ page }) => {
  const verify = await isolate(page);
  await open(page); await preview(page); await measure(page);
  await page.getByTestId('walk-button-measure').click();
  await page.getByTestId('fixture-coordinate-edit').click();
  expect(await page.evaluate(() => window.walkFixture.state.requests[1].signal.aborted)).toBe(true);
  await page.evaluate(() => window.walkFixture.complete(1, 99, 999));
  await expect(page.getByTestId('walk-status-metrics')).toContainText('Not measured');
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(0);
  await measure(page, 2);
  expect(await page.evaluate(() => window.walkFixture.state.requests[2].stops[0].lat)).toBeCloseTo(55.863);
  expect((await firstRouteCoordinate(page))[1]).toBeCloseTo(55.863);
  await verify();
});

test('story-only edit preserves route and metrics and updates rendered story', async ({ page }) => {
  const verify = await isolate(page);
  await open(page); await preview(page); await measure(page);
  await page.getByTestId('walk-input-story-0').fill('A revised cathedral story, with no coordinate changes.');
  await expect(page.getByTestId('walk-list-preview')).toContainText('A revised cathedral story');
  await expect(page.getByTestId('walk-status-metrics')).toContainText('2.4 km · 32 min');
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(1);
  expect(await page.evaluate(() => window.walkFixture.state.requests.length)).toBe(1);
  expect(await page.evaluate(() => window.mapFixture.created)).toBe(1);
  await verify();
});

test('map library timeout removes assets and retry renders a fresh map', async ({ page }) => {
  const options = { timeoutFirst: true };
  const verify = await isolate(page, options);
  await page.clock.install();
  await open(page);
  await page.getByTestId('walk-button-preview').click();
  await expect(page.getByText('Loading map…', { exact: true })).toBeVisible();
  await page.clock.fastForward(15001);
  await expect(page.getByTestId('walk-status-map-error')).toBeVisible();
  expect(await page.locator('script[data-leaflet]').count()).toBe(0);
  expect(await page.locator('link[href*="leaflet"]').count()).toBe(0);
  // Release the abandoned network request so Chromium does not coalesce a
  // fresh identical script URL with the still-held request.
  await options.releaseScript();
  await expect(page.getByTestId('walk-list-preview')).toContainText('An original cathedral story');
  await page.getByRole('button', { name: 'Retry map', exact: true }).click();
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(3);
  await expect(page.getByTestId('walk-status-map-error')).toHaveCount(0);
  await expect(page.locator('script[data-leaflet]')).toHaveCount(1);
  await verify();
});

test('map stylesheet error does not poison later library retry', async ({ page }) => {
  const verify = await isolate(page, { cssErrorFirst: true });
  await open(page);
  await page.getByTestId('walk-button-preview').click();
  await expect(page.getByTestId('walk-status-map-error')).toBeVisible();
  await page.getByRole('button', { name: 'Retry map', exact: true }).click();
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(3);
  await expect(page.getByTestId('walk-status-map-error')).toHaveCount(0);
  await verify();
});

test('tile error keeps pins and route visible; retry cleans up map and observer', async ({ page }) => {
  const options = { tileErrors: true };
  const verify = await isolate(page, options);
  await open(page); await preview(page); await measure(page);
  await expect(page.getByTestId('walk-status-tile-error')).toBeVisible();
  await expect(page.getByTestId('walk-status-map-error')).toHaveCount(0);
  const oldTiles = await page.evaluateHandle(() => {
    let tiles;
    window.mapFixture.live[0].eachLayer(layer => { if (layer._url) tiles = layer; });
    return tiles;
  });
  options.tileErrors = false;
  await page.getByRole('button', { name: 'Retry map tiles' }).click();
  await expect(page.getByTestId('walk-status-tile-error')).toHaveCount(0);
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(3);
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(1);
  expect(await page.evaluate(() => window.mapFixture.removed)).toBe(1);
  expect(await page.evaluate(() => window.observerFixture.live)).toBe(1);
  // Old event handlers cannot report tile failures against the replacement map.
  await page.evaluate(tiles => tiles.fire('tileerror'), oldTiles);
  await expect(page.getByTestId('walk-status-tile-error')).toHaveCount(0);
  await verify();
});

test('hide and reopen releases map/observer and reuses geometry without duplicate assets', async ({ page }) => {
  const verify = await isolate(page);
  await open(page); await preview(page); await measure(page);
  await page.getByTestId('walk-button-preview').click();
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
  expect(await page.evaluate(() => window.mapFixture.live.length)).toBe(0);
  expect(await page.evaluate(() => window.observerFixture.live)).toBe(0);
  await preview(page);
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(1);
  expect(await page.evaluate(() => window.mapFixture.created)).toBe(2);
  expect(await page.evaluate(() => window.mapFixture.removed)).toBe(1);
  await expect(page.locator('script[data-leaflet]')).toHaveCount(1);
  await verify();
});

test('hide/reopen during library load shares assets but only initializes the live map', async ({ page }) => {
  const options = { holdFirst: true };
  const verify = await isolate(page, options);
  await open(page);
  await page.getByTestId('walk-button-preview').click();
  await expect(page.getByText('Loading map…', { exact: true })).toBeVisible();
  await page.getByTestId('walk-button-preview').click();
  await expect(page.getByTestId('walk-map-preview')).toHaveCount(0);
  await page.getByTestId('walk-button-preview').click();
  await options.releaseScript();
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(3);
  expect(await page.evaluate(() => window.mapFixture.created)).toBe(1);
  expect(await page.evaluate(() => window.observerFixture.live)).toBe(1);
  await expect(page.locator('script[data-leaflet]')).toHaveCount(1);
  await verify();
});

test('closing the editor during library load leaves no stale map or observer and can reopen', async ({ page }) => {
  const options = { holdFirst: true };
  const verify = await isolate(page, options);
  await open(page);
  await page.getByTestId('walk-button-preview').click();
  await expect(page.getByText('Loading map…', { exact: true })).toBeVisible();

  await page.getByTestId('walk-button-close').click();
  await expect(page.getByTestId('fixture-closed')).toBeVisible();
  expect(await page.evaluate(() => window.walkFixture.state.requests[0].signal.aborted)).toBe(true);
  await options.releaseScript();
  await expect.poll(() => page.evaluate(() => Boolean(window.L))).toBe(true);
  expect(await page.evaluate(() => window.mapFixture.created)).toBe(0);
  expect(await page.evaluate(() => window.mapFixture.live.length)).toBe(0);
  expect(await page.evaluate(() => window.observerFixture.observed)).toBe(0);
  expect(await page.evaluate(() => window.observerFixture.live)).toBe(0);

  await page.getByTestId('fixture-reopen').click();
  await expect(page.getByTestId('walk-form')).toBeVisible();
  await page.getByTestId('walk-button-preview').click();
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(3);
  expect(await page.evaluate(() => window.mapFixture.created)).toBe(1);
  expect(await page.evaluate(() => window.mapFixture.live.length)).toBe(1);
  expect(await page.evaluate(() => window.observerFixture.observed)).toBe(1);
  expect(await page.evaluate(() => window.observerFixture.live)).toBe(1);
  await verify();
});

test('dirty discard keeps edits on cancel; confirmed discard aborts and cleans up', async ({ page }) => {
  const verify = await isolate(page);
  await open(page); await preview(page);
  await page.getByTestId('walk-input-title').fill('Unsaved fixture title');
  await page.getByTestId('walk-button-close').click();
  await expect(page.getByTestId('walk-dialog-discard')).toBeVisible();
  await expect(page.getByTestId('walk-button-keep-editing')).toBeFocused();
  await page.getByTestId('walk-button-keep-editing').click();
  await expect(page.getByTestId('walk-input-title')).toHaveValue('Unsaved fixture title');
  await expect(page.getByTestId('walk-button-close')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.getByTestId('walk-button-confirm-discard').click();
  await expect(page.getByTestId('fixture-closed')).toBeVisible();
  expect(await page.evaluate(() => window.walkFixture.state.requests[0].signal.aborted)).toBe(true);
  expect(await page.evaluate(() => window.mapFixture.live.length)).toBe(0);
  expect(await page.evaluate(() => window.observerFixture.live)).toBe(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await page.evaluate(() => window.walkFixture.complete(0));
  await page.getByTestId('fixture-reopen').click();
  await expect(page.getByTestId('walk-input-title')).toHaveValue('Fixture Glasgow walk');
  await preview(page);
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(0);
  await verify();
});

for (const count of [0, 1]) {
  test(`${count}-stop preview has no invented route and cannot measure or publish`, async ({ page }) => {
    const verify = await isolate(page);
    // The empty editor intentionally has no preview toggle. Remove its final
    // stop with preview already open to exercise the zero-stop map lifecycle.
    await open(page, 1);
    await page.getByTestId('walk-button-preview').click();
    if (count === 0) await page.getByTestId('walk-button-remove-0').click();
    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon')).toHaveCount(count);
    await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(0);
    await expect(page.getByTestId('walk-button-measure')).toBeDisabled();
    await expect(page.getByTestId('walk-status-route-preview')).toContainText('Add at least 2 stops');
    await page.getByTestId('walk-button-publish').click();
    await expect(page.getByTestId('walk-form')).toContainText('Add at least 2 stops to publish');
    expect(await page.evaluate(() => window.walkFixture.state.requests.length)).toBe(0);
    await verify();
  });
}

test('mobile map fits drawer, resizes, and retains usable controls', async ({ page }) => {
  const verify = await isolate(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page); await preview(page); await measure(page);
  const canvas = page.getByTestId('walk-map-preview');
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  expect(bounds.height).toBe(260);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(await page.locator('.adm-drawer').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  const before = await page.evaluate(() => window.mapFixture.resized);
  await page.setViewportSize({ width: 360, height: 780 });
  await expect.poll(() => page.evaluate(() => window.mapFixture.resized)).toBeGreaterThan(before);
  await page.locator('.leaflet-control-zoom-in').click();
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(3);
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(1);
  await verify();
});