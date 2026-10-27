import { test, expect } from '@playwright/test';
import { isolateEmail } from './network.mjs';

test('Open in navigation uses attraction names in both map apps and keeps stop order', async ({ page }) => {
  const state = await isolateEmail(page);
  await page.goto('/tests/email/index.html');
  await page.getByTestId('card-tour-fixture-curated').click();

  await page.evaluate(() => {
    window.__navigationUrls = [];
    window.open = (url, target) => {
      if (target === '_blank') window.__navigationUrls.push(String(url));
      return null;
    };
  });

  await expect(page.getByTestId('button-open-itinerary-navigation')).toBeEnabled();
  await page.getByTestId('button-open-itinerary-navigation').click();
  await expect(page.getByTestId('button-open-tour-navigation')).toBeEnabled();
  await page.getByTestId('button-open-tour-navigation').click();

  const captured = await page.evaluate(() => window.__navigationUrls);
  expect(captured).toHaveLength(4);
  const urls = captured.map(value => new URL(value));

  for (const apple of [urls[0], urls[2]]) {
    expect(apple.searchParams.get('saddr')).toBe('Fixture first sight');
    expect(apple.searchParams.get('daddr')).toBe('Fixture second sight');
    expect(apple.searchParams.get('dirflg')).toBe('w');
    expect(apple.searchParams.has('waypoint')).toBe(false);
  }
  for (const google of [urls[1], urls[3]]) {
    expect(google.searchParams.get('origin')).toBe('Fixture first sight');
    expect(google.searchParams.get('destination')).toBe('Fixture second sight');
    expect(google.searchParams.get('travelmode')).toBe('walking');
    expect(google.searchParams.has('waypoints')).toBe(false);
  }
  expect(captured.join(' ')).not.toContain('55.864200');
  expect(captured.join(' ')).not.toContain('55.865100');
  state.assertClean();
});
