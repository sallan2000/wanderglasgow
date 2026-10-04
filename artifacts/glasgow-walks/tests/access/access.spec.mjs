import { test, expect } from '@playwright/test';
import { isolateEmail } from '../email/network.mjs';

const base = { id: 'legacy', name: 'A legacy sight', description: 'Original description about a Glasgow sight.', place: 'City centre',
  theme: 'History', latitude: 55.8642, longitude: -4.2518, published: true, updated_at: '2026-10-01T00:00:00Z' };

test('editor defaults unknown, saves all access values, reopens and reloads from transport', async ({ page }) => {
  const network = await isolateEmail(page);
  let row = { ...base }, writes = [];
  await page.route('https://supabase.fixture.invalid/rest/v1/glasgow_attractions*', async route => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,PATCH,OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (route.request().method() === 'PATCH') {
      const payload = route.request().postDataJSON(); writes.push(payload); row = { ...row, ...payload };
      return route.fulfill({ headers: cors, json: row });
    }
    return route.fulfill({ headers: cors, json: [row] });
  });
  await page.goto('/tests/access/index.html?editor');
  for (const key of ['stepFree', 'accessibleToilet', 'seating']) await expect(page.getByTestId(`select-access-${key}`)).toHaveValue('unknown');
  await page.getByTestId('select-access-stepFree').selectOption('yes');
  await page.getByTestId('select-access-accessibleToilet').selectOption('no');
  await page.getByTestId('select-access-seating').selectOption('yes');
  await page.getByTestId('input-access-notes').fill('Side entrance has a ramp. <script>alert(1)</script>');
  await expect(page.getByTestId('status-unsaved')).toBeVisible();
  await page.getByTestId('button-save-attraction').click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved and reopened' })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ step_free_access: 'yes', accessible_toilet: 'no', seating: 'yes',
    access_notes: 'Side entrance has a ramp. <script>alert(1)</script>' });
  await expect(page.getByTestId('button-save-attraction')).toBeDisabled();
  await page.reload();
  await expect(page.getByTestId('select-access-stepFree')).toHaveValue('yes');
  await expect(page.getByTestId('input-access-notes')).toHaveValue(writes[0].access_notes);
  await page.getByTestId('select-access-stepFree').selectOption('unknown');
  await page.getByTestId('input-access-notes').fill('');
  await page.getByTestId('button-save-attraction').click();
  await expect(page.getByTestId('button-save-attraction')).toBeDisabled();
  expect(writes[1]).toMatchObject({ step_free_access: 'unknown', access_notes: '' });
  network.assertClean();
});

test('older schema gives a real downloadable upgrade and keeps unsaved access fields', async ({ page }) => {
  const network = await isolateEmail(page);
  await page.route('https://supabase.fixture.invalid/rest/v1/glasgow_attractions*', async route => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,PATCH,OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (route.request().method() === 'PATCH') return route.fulfill({ status: 400, headers: cors, json: { code: 'PGRST204' } });
    return route.fulfill({ headers: cors, json: [base] });
  });
  await page.goto('/tests/access/index.html?editor');
  await page.getByTestId('select-access-stepFree').selectOption('yes');
  await page.getByTestId('button-save-attraction').click();
  await expect(page.getByTestId('link-access-upgrade-sql')).toHaveAttribute('href', '/access-details-upgrade.sql');
  await expect(page.getByTestId('select-access-stepFree')).toHaveValue('yes');
  const response = await page.request.get('/access-details-upgrade.sql');
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain('add column if not exists step_free_access');
  network.assertClean();
});

test('planner renders legacy Unknown, filters no/unknown and safely renders owner notes', async ({ page }) => {
  const network = await isolateEmail(page);
  network.catalogue = [base, { ...base, id: 'known', name: 'Confirmed entrance', latitude: 55.8651, longitude: -4.256,
    step_free_access: 'yes', accessible_toilet: 'no', seating: 'yes', access_notes: '<img src=x onerror=alert(1)> Owner note' }];
  await page.goto('/tests/access/index.html');
  await page.getByTestId('button-mode-nearby').click();
  await page.getByTestId('button-plan-route').click();
  await expect(page.getByTestId('access-plan-legacy')).toContainText('Step-free entrance: Unknown');
  await expect(page.getByTestId('access-plan-known')).toContainText('Accessible toilet: No');
  await expect(page.getByTestId('access-plan-known')).toContainText('<img src=x onerror=alert(1)> Owner note');
  await expect(page.getByTestId('access-plan-known').locator('img')).toHaveCount(0);
  await page.getByTestId('checkbox-step-free').check();
  await expect(page.getByTestId('result-plan')).toHaveCount(0);
  network.walkingMatrix = [[0, 600], [600, 0]];
  await page.getByTestId('button-plan-route').click();
  await expect(page.getByTestId('access-plan-known')).toBeVisible();
  await expect(page.getByTestId('access-plan-legacy')).toHaveCount(0);
  await expect(page.getByTestId('text-access-filter-note')).toContainText('does not assess the paths');
  const table = network.routingRequests.filter(r => r.points.length === 2);
  expect(table.length).toBeGreaterThan(0);
  network.catalogue = [{ ...base, step_free_access: 'no', accessible_toilet: 'unknown', seating: 'unknown', access_notes: '' }];
  await page.getByTestId('button-plan-route').click();
  await expect(page.getByTestId('status-planner-error')).toContainText('Unknown access is excluded');
  await page.getByTestId('checkbox-step-free').uncheck();
  await page.getByTestId('button-plan-route').click();
  await expect(page.getByTestId('access-plan-legacy')).toBeVisible();
  await page.reload();
  await page.getByTestId('button-mode-nearby').click();
  await expect(page.getByTestId('checkbox-step-free')).not.toBeChecked();
  network.assertClean();
});

test('access preference is keyboard-operable on mobile without layout overflow', async ({ page }) => {
  const network = await isolateEmail(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tests/access/index.html');
  await page.getByTestId('button-mode-nearby').click();
  const checkbox = page.getByTestId('checkbox-step-free');
  await checkbox.focus(); await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Space'); await expect(checkbox).not.toBeChecked();
  network.assertClean();
});