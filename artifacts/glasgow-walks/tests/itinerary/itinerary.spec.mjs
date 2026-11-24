import { test, expect } from '@playwright/test';
import { isolateEmail } from '../email/network.mjs';

async function expectNoExportControls(container) {
  await expect(container.getByTestId('button-download-itinerary')).toHaveCount(0);
  await expect(container.getByTestId('button-print-itinerary')).toHaveCount(0);
  await expect(container.getByRole('button', { name: /download|print/i })).toHaveCount(0);
  await expect(container.getByRole('link', { name: /download|print/i })).toHaveCount(0);
}

async function expectDirections(link, origin, destination) {
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  const url = new URL(await link.getAttribute('href'));
  expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
  expect(url.searchParams.get('origin')).toBe(origin);
  expect(url.searchParams.get('destination')).toBe(destination);
  expect(url.searchParams.get('travelmode')).toBe('walking');
}

test('curated walk retains ordered stops and directions when the map fails, without export controls', async ({ page }) => {
  const state = await isolateEmail(page);
  await page.goto('/tests/email/index.html');
  await page.getByTestId('card-tour-fixture-curated').click();
  const dialog = page.getByTestId('dialog-tour-fixture-curated');
  await expect(page.getByTestId('status-tour-map-error')).toBeVisible();
  await expect(dialog.locator('article h4')).toHaveText(['Fixture first sight', 'Fixture second sight']);
  await expectDirections(page.getByTestId('button-open-itinerary-navigation'), 'Fixture first sight', 'Fixture second sight');
  await expectDirections(page.getByTestId('button-open-tour-navigation'), 'Fixture first sight', 'Fixture second sight');
  await expect(dialog.getByTestId('button-email-walk')).toBeVisible();
  await expectNoExportControls(dialog);
  expect(state.mapRequests).toEqual([]);
  expect(state.sends).toEqual([]);
  await page.getByTestId('button-dismiss-detail').click();
  await expect(dialog).toHaveCount(0);
  state.assertClean();
});

test('planned walk retains ordered escaped stops, access details and directions without export controls', async ({ page }) => {
  const state = await isolateEmail(page);
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
  const result = page.getByTestId('result-plan');
  await expect(result).toBeVisible();
  await expect(page.getByTestId('status-plan-map-error')).toBeVisible();
  await expect(result.locator('article.plan-stop h4')).toHaveText(['<script>alert(1)</script>', 'Last sight']);
  await expect(result).toContainText('Owner note');
  await expect(result.locator('script,img,iframe')).toHaveCount(0);
  await expectDirections(page.getByTestId('button-open-itinerary-navigation'), '55.862500,-4.249000', 'Last sight');
  await expect(result.getByTestId('button-email-walk')).toBeVisible();
  await expectNoExportControls(result);
  expect(state.mapRequests).toEqual([]);
  expect(state.sends).toEqual([]);
  state.assertClean();
});

test('mobile directions are keyboard-focusable and walk details do not overflow', async ({ page }) => {
  const state = await isolateEmail(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tests/email/index.html');
  await page.getByTestId('card-tour-fixture-curated').click();
  const dialog = page.getByTestId('dialog-tour-fixture-curated');
  const link = page.getByTestId('button-open-itinerary-navigation');
  await link.focus();
  await expect(link).toBeFocused();
  await expectDirections(link, 'Fixture first sight', 'Fixture second sight');
  await expectNoExportControls(dialog);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  state.assertClean();
});

test('email fixture exposes exact totals and respects pagination offsets', async ({ page }) => {
  const state = await isolateEmail(page);
  await page.goto('/tests/email/index.html');
  const pages = await page.evaluate(async () => {
    const base = 'https://supabase.fixture.invalid/rest/v1/glasgow_attractions?select=*&';
    return Promise.all([0, 1, 2].map(async offset => {
      const response = await fetch(`${base}offset=${offset}&limit=1`, { headers: { Prefer: 'count=exact' } });
      return { range: response.headers.get('content-range'), rows: await response.json() };
    }));
  });
  expect(pages.map(p => p.range)).toEqual(['0-0/2', '1-1/2', '*/2']);
  expect(pages.map(p => p.rows.map(row => row.id))).toEqual([['fixture-stop-1'], ['fixture-stop-2'], []]);
  state.assertClean();
});
