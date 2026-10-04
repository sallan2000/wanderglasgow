import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isolateEmail } from '../email/network.mjs';

async function download(page, testInfo, filename) {
  const downloaded = page.waitForEvent('download');
  await page.getByTestId('button-download-itinerary').click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toMatch(/^wander-glasgow-[a-z0-9-]+\.html$/);
  expect(await file.failure()).toBeNull();
  const path = testInfo.outputPath(filename);
  await file.saveAs(path);
  return { path, html: await readFile(path, 'utf8') };
}

async function offlineFile(browser, path) {
  const context = await browser.newContext({ offline: true });
  const page = await context.newPage();
  const requests = [], dialogs = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.goto(pathToFileURL(path).href);
  return { context, page, requests, dialogs };
}

test('curated download opens offline without requests, invented paths or user location', async ({ page, browser }, testInfo) => {
  const state = await isolateEmail(page);
  await page.goto('/tests/email/index.html');
  await page.getByTestId('card-tour-fixture-curated').click();
  await expect(page.getByTestId('status-tour-map-error')).toBeVisible();
  const requests = [];
  page.on('request', r => { if (r.url().startsWith('https://')) requests.push(r.url()); });
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  await expect(page.getByTestId('text-itinerary-privacy')).toContainText('no GPS connector');
  const file = await download(page, testInfo, 'curated.html');
  expect(file.html).not.toContain('<svg');
  expect(file.html).not.toContain('55.862500'); // GPS fixture coordinate
  expect(requests).toEqual([]);
  expect(state.sends).toHaveLength(0);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).toBe(storage);
  const offline = await offlineFile(browser, file.path);
  await expect(offline.page.getByRole('heading', { level: 1 })).toHaveText('Fixture editorial Glasgow');
  await expect(offline.page.locator('article.stop')).toHaveCount(2);
  await expect(offline.page.locator('main')).toContainText('Attraction access: Unknown');
  await expect(offline.page.locator('main')).toContainText('Curated walking estimates: 2.10 km');
  expect(offline.requests).toEqual([]); expect(offline.dialogs).toEqual([]);
  await offline.context.close();
  state.assertClean();
});

test('calculated download preserves route, stop order and safely escaped access notes offline', async ({ page, browser }, testInfo) => {
  const state = await isolateEmail(page);
  await page.addInitScript(() => {
    window.print = () => {
      parent.__plannedPrint = document.documentElement.outerHTML;
      setTimeout(() => window.dispatchEvent(new Event('afterprint')), 30);
    };
  });
  state.catalogue = [
    { id: 'first', name: '<script>alert(1)</script>', place: 'George Square', description: '<img src=https://evil.invalid onerror=alert(2)> Story one',
      latitude: 55.8642, longitude: -4.2518, theme: 'History', published: true, updated_at: '2026-10-04T10:00:00Z',
      step_free_access: 'yes', accessible_toilet: 'no', seating: 'unknown', access_notes: '</p><iframe src=https://evil.invalid>Owner note</iframe>' },
    { id: 'second', name: 'Last sight', place: 'Buchanan Street', description: 'The final stop in order.',
      latitude: 55.8651, longitude: -4.256, theme: 'History', published: true, updated_at: '2026-10-04T10:00:00Z' },
  ];
  await page.goto('/tests/email/index.html');
  await page.getByTestId('button-mode-nearby').click();
  await page.getByTestId('button-plan-route').click();
  await expect(page.getByTestId('result-plan')).toBeVisible();
  await expect(page.getByTestId('status-plan-map-error')).toBeVisible();
  const prior = state.routingRequests.length;
  const requests = [];
  page.on('request', r => { if (r.url().startsWith('https://')) requests.push(r.url()); });
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  await expect(page.getByTestId('text-itinerary-privacy')).toContainText('may include your GPS location');
  const file = await download(page, testInfo, 'planned.html');
  expect(state.routingRequests).toHaveLength(prior);
  expect(requests).toEqual([]);
  expect(state.sends).toHaveLength(0);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).toBe(storage);
  await page.getByTestId('button-print-itinerary').click();
  await expect.poll(() => page.evaluate(() => window.__plannedPrint ?? '')).toContain('<polyline points=');
  const printCopy = await page.evaluate(() => window.__plannedPrint);
  expect(printCopy).toContain('55.862500, -4.249000');
  expect(printCopy).toContain('Last sight');
  expect(printCopy).not.toContain('input-plan-radius');
  await expect(page.locator('iframe[title="Printable itinerary"]')).toHaveCount(0);
  expect(state.routingRequests).toHaveLength(prior);
  expect(requests).toEqual([]);
  const offline = await offlineFile(browser, file.path);
  await expect(offline.page.locator('article.stop h3')).toHaveText(['1. <script>alert(1)</script>', '2. Last sight']);
  await expect(offline.page.locator('main')).toContainText('Owner note');
  await expect(offline.page.locator('main')).toContainText('Accessible toilet: No');
  await expect(offline.page.locator('main')).toContainText('55.862500, -4.249000');
  await expect(offline.page.getByRole('img', { name: 'Calculated walking-route shape' })).toBeVisible();
  await expect(offline.page.locator('main')).toContainText('© OpenStreetMap contributors');
  await expect(offline.page.locator('script,img,iframe,link')).toHaveCount(0);
  expect(offline.requests).toEqual([]); expect(offline.dialogs).toEqual([]);
  await offline.context.close();
  state.assertClean();
});

test('print uses complete document under production frame policy, cleans up and retries after cancellation', async ({ page }) => {
  const state = await isolateEmail(page);
  await page.addInitScript(() => {
    window.print = () => {
      parent.__printCopies = [...(parent.__printCopies ?? []), document.documentElement.outerHTML];
      setTimeout(() => window.dispatchEvent(new Event('afterprint')), 30);
    };
  });
  await page.goto('/tests/email/index.html');
  await page.getByTestId('card-tour-fixture-curated').click();
  await expect(page.getByTestId('status-tour-map-error')).toBeVisible();
  const headers = await readFile(resolve(import.meta.dirname, '../../public/_headers'), 'utf8');
  const framePolicy = headers.split(';').map(s => s.trim()).find(s => s.startsWith('frame-src '));
  await page.evaluate(policy => {
    const meta = document.createElement('meta'); meta.httpEquiv = 'Content-Security-Policy'; meta.content = policy;
    document.head.appendChild(meta);
  }, framePolicy);
  await page.getByTestId('button-print-itinerary').click();
  await expect.poll(() => page.evaluate(() => window.__printCopies?.length ?? 0)).toBe(1);
  const printed = await page.evaluate(() => window.__printCopies[0]);
  expect(printed).toContain('Fixture editorial Glasgow');
  expect(printed).toContain('@page { size: A4;');
  expect(printed).not.toContain('button-email-walk');
  expect(printed).not.toContain('detail-drawer');
  await expect(page.locator('iframe[title="Printable itinerary"]')).toHaveCount(0);
  await expect(page.getByTestId('button-print-itinerary')).toBeFocused();
  await page.getByTestId('button-print-itinerary').click();
  await expect.poll(() => page.evaluate(() => window.__printCopies.length)).toBe(2);
  await expect(page.locator('iframe[title="Printable itinerary"]')).toHaveCount(0);
  state.assertClean();
});

test('print error permits retry and download; asynchronous print retains its iframe', async ({ page }) => {
  const state = await isolateEmail(page);
  await page.addInitScript(() => {
    window.print = () => { if (parent.__blockPrint !== false) throw new Error('Blocked printing'); };
  });
  await page.goto('/tests/email/index.html');
  await page.getByTestId('card-tour-fixture-curated').click();
  await page.getByTestId('button-print-itinerary').click();
  await expect(page.getByTestId('status-itinerary-error')).toContainText('Use Download');
  await expect(page.getByTestId('button-print-itinerary')).toBeEnabled();
  await page.evaluate(() => { window.__blockPrint = false; });
  await page.getByTestId('button-print-itinerary').click();
  await expect(page.getByTestId('status-itinerary')).toContainText('Print requested');
  await expect(page.locator('iframe[title="Printable itinerary"]')).toHaveCount(1);
  await expect(page.getByTestId('button-print-itinerary')).toBeEnabled();
  await page.getByTestId('button-close-detail').click();
  await expect(page.locator('iframe[title="Printable itinerary"]')).toHaveCount(0);
  state.assertClean();
});

test('multi-page export remains complete and produces a paginated PDF', async ({ page, browser }, testInfo) => {
  const state = await isolateEmail(page);
  await page.route('https://supabase.fixture.invalid/rest/v1/glasgow_curated_walks*', async route => {
    const stops = Array.from({ length: 6 }, (_, i) => ({
      name: `Long stop ${i + 1}`, place: 'City centre', lat: 55.8642 + i / 10000, lon: -4.2518,
      story: `${'A detailed story with room for a pause. '.repeat(120)}Last sentence of stop ${i + 1}.`,
    }));
    await route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, json: [
      { id: 'long', title: 'A long itinerary', subtitle: 'Complete stories on multiple pages.', theme: 'History',
        stops, distance_km: 2, minutes: 30, published: true, updated_at: '2026-10-04T10:00:00Z' },
    ] });
  });
  await page.goto('/tests/email/index.html');
  await page.getByTestId('card-tour-long').click();
  const file = await download(page, testInfo, 'long.html');
  const offline = await offlineFile(browser, file.path);
  await offline.page.emulateMedia({ media: 'print' });
  await expect(offline.page.locator('article.stop')).toHaveCount(6);
  await expect(offline.page.locator('article.stop').last()).toContainText('Last sentence of stop 6.');
  const pdf = await offline.page.pdf({ preferCSSPageSize: true, path: testInfo.outputPath('long.pdf') });
  expect((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length).toBeGreaterThan(1);
  expect(await offline.page.locator('main').evaluate(el => getComputedStyle(el).overflow)).toBe('visible');
  expect(offline.requests).toEqual([]);
  await offline.context.close();
  state.assertClean();
});

test('mobile actions work by keyboard and exported content does not overflow', async ({ page, browser }, testInfo) => {
  const state = await isolateEmail(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tests/email/index.html');
  await page.getByTestId('card-tour-fixture-curated').click();
  const action = page.getByTestId('button-download-itinerary');
  await action.focus();
  const downloading = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const file = await downloading;
  const path = testInfo.outputPath('mobile.html'); await file.saveAs(path);
  await expect(action).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const offline = await offlineFile(browser, path);
  await offline.page.setViewportSize({ width: 390, height: 844 });
  expect(await offline.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await offline.context.close();
  state.assertClean();
});