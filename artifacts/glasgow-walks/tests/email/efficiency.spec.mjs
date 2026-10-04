import { test, expect } from '@playwright/test';
import { isolateEmail } from './network.mjs';

function catalogue(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `efficient-${i + 1}`, name: `Efficiency sight ${i + 1}`, description: 'A published walking attraction.',
    place: 'Glasgow', theme: 'History', latitude: 55.8625 + (i + 1) * .00001, longitude: -4.249,
    published: true, updated_at: '2026-10-04T10:00:00Z',
  }));
}

test('both planning modes keep the stop target and compare sights beyond the old nearest-12 shortlist', async ({ page }) => {
  const state = await isolateEmail(page);
  state.catalogue = catalogue(15);
  state.walkingMatrix = Array.from({ length: 16 }, (_, from) => Array.from({ length: 16 }, (_, to) =>
    from === to ? 0 : from === 0 ? to >= 13 ? 800 : 100 : from >= 13 && to >= 13 ? 20 :
      (from >= 13) !== (to >= 13) ? 900 : 600));
  await page.goto('/tests/email/index.html');
  await page.getByTestId('button-mode-nearby').click();
  await page.getByTestId('button-stops-3').click(); await page.getByTestId('button-plan-route').click();
  await expect(page.getByTestId('text-plan-summary')).toContainText('3 stops');
  await expect(page.getByTestId('text-plan-summary')).toContainText('840 m');
  for (const id of [13,14,15]) await expect(page.getByTestId(`stop-plan-efficient-${id}`)).toBeVisible();
  expect(state.routingRequests[0].points).toHaveLength(16);
  expect(state.routingRequests[1].continueStraight).toBe('false');
  await expect(page.getByTestId('text-plan-disclaimer')).toContainText('shortest stop order');
  await expect(page.getByTestId('text-plan-disclaimer')).toContainText('can still require retracing');
  await page.getByTestId('button-mode-theme').click();
  await page.getByTestId('button-theme-history').click(); await page.getByTestId('button-plan-route').click();
  await expect(page.getByTestId('text-plan-summary')).toContainText('840 m');
  for (const id of [13,14,15]) await expect(page.getByTestId(`stop-plan-efficient-${id}`)).toBeVisible();
  state.assertClean();
});

test('an unexplained route detour is rejected and the same route settings can be retried', async ({ page }) => {
  const state = await isolateEmail(page);
  state.routeDistanceOverride = 900;
  await page.goto('/tests/email/index.html');
  await page.getByTestId('button-mode-nearby').click(); await page.getByTestId('button-plan-route').click();
  await expect(page.getByTestId('status-planner-error')).toContainText('does not match the optimised distances');
  await expect(page.getByTestId('result-plan')).toHaveCount(0);
  state.routeDistanceOverride = null;
  await page.getByTestId('button-plan-route').click();
  await expect(page.getByTestId('text-plan-summary')).toContainText('700 m');
  state.assertClean();
});

test('too many eligible sights produce guidance rather than silently dropping stops or claiming an optimum', async ({ page }) => {
  const state = await isolateEmail(page); state.catalogue = catalogue(51);
  await page.goto('/tests/email/index.html');
  await page.getByTestId('button-mode-nearby').click(); await page.getByTestId('button-plan-route').click();
  await expect(page.getByTestId('status-planner-error')).toContainText('every candidate');
  await expect(page.getByTestId('result-plan')).toHaveCount(0);
  expect(state.routingRequests).toHaveLength(0);
  await expect(page.getByTestId('button-plan-route')).toBeEnabled();
  state.assertClean();
});