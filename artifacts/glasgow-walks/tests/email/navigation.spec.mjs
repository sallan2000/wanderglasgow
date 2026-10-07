import { test, expect } from '@playwright/test';

test('Open in navigation: clickable for every real walk and emits both apps with stop order', async ({ page }) => {
  await page.goto('/tests/email/index.html');
  await page.getByTestId('card-tour-fixture-curated').click();

  const captured = [];
  await page.addInitScript(() => {
    // Stub the popup opener so the test can assert the exact destination URLs
    // without leaving the browser or opening tabs.
    window.open = (url, target) => {
      if (target === '_blank') captured.push(url);
      return null;
    };
  });

  await expect(page.getByTestId('button-open-itinerary-navigation')).toBeEnabled();
  await page.getByTestId('button-open-itinerary-navigation').click();
  await expect(page.getByTestId('button-open-tour-navigation')).toBeEnabled();
  await page.getByTestId('button-open-tour-navigation').click();

  expect(captured).toHaveLength(2);
  const [apple, google] = captured;
  expect(apple).toContain('saddr=55.864200,-4.251800');
  expect(apple).toContain('daddr=55.865100,-4.256000');
  expect(apple).not.toContain('waypoint=');
  expect(google).toContain('origin=55.864200,-4.251800');
  expect(google).toContain('destination=55.865100,-4.256000');
  expect(google).toContain('travelmode=walking');
  expect(google).not.toContain('waypoints=');
});
