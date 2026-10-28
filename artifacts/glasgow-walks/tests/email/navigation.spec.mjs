import { test, expect } from '@playwright/test';
import { isolateEmail } from './network.mjs';

test('Open in Google Maps uses a cross-platform directions link with attraction names', async ({ page }) => {
  const state = await isolateEmail(page);
  await page.goto('/tests/email/index.html');
  await page.getByTestId('card-tour-fixture-curated').click();
  await page.getByTestId('section-itinerary-actions').waitFor({ state: 'visible', timeout: 5000 });

  const navigationLinks = [
    page.getByTestId('button-open-itinerary-navigation'),
    page.getByTestId('button-open-tour-navigation'),
  ];
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const link of navigationLinks) {
      await expect(link).toHaveAttribute(
        'href',
        /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1/,
      );
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      await expect(link).toHaveText('Directions');

      const url = new URL(await link.getAttribute('href'));
      expect(url.hostname).toBe('www.google.com');
      expect(url.searchParams.get('origin')).toBe('Fixture first sight');
      expect(url.searchParams.get('destination')).toBe('Fixture second sight');
      expect(url.searchParams.get('travelmode')).toBe('walking');
      expect(url.searchParams.has('waypoints')).toBe(false);
    }
  }
  state.assertClean();
});

test('long routes expose ordered Google Maps segments for mobile browsers', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tests/email/navigation-fixture.html');

  const directLink = page.getByTestId('route-navigation');
  await expect(directLink).toHaveAttribute('target', '_blank');
  await expect(directLink).toHaveAttribute('rel', 'noopener noreferrer');
  const directUrl = new URL(await directLink.getAttribute('href'));
  expect(directUrl.searchParams.get('waypoints')).toBe('Stop 1|Stop 2|Stop 3|Stop 4|Stop 5');

  const segmentLinks = [
    page.getByTestId('route-navigation-segment-1'),
    page.getByTestId('route-navigation-segment-2'),
  ];
  await expect(page.getByTestId('route-navigation-segments')).toContainText(
    'For mobile browsers, open these route parts in order.',
  );
  for (const link of segmentLinks) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }

  const first = new URL(await segmentLinks[0].getAttribute('href'));
  expect(first.searchParams.get('origin')).toBe('55.860000,-4.250000');
  expect(first.searchParams.get('waypoints')).toBe('Stop 1|Stop 2|Stop 3');
  expect(first.searchParams.get('destination')).toBe('Stop 4');

  const second = new URL(await segmentLinks[1].getAttribute('href'));
  expect(second.searchParams.get('origin')).toBe('Stop 4');
  expect(second.searchParams.get('waypoints')).toBe('Stop 5');
  expect(second.searchParams.get('destination')).toBe('Stop 6');
  expect(await page.locator('body').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(390);
});

test('a route with three waypoints stays a single direct Google Maps link', async ({ page }) => {
  await page.goto('/tests/email/navigation-fixture.html?points=5');

  const directLink = page.getByTestId('route-navigation');
  await expect(directLink).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1/);
  await expect(page.getByTestId('route-navigation-segments')).toHaveCount(0);
  const url = new URL(await directLink.getAttribute('href'));
  expect(url.searchParams.get('waypoints')).toBe('Stop 1|Stop 2|Stop 3');
  expect(url.searchParams.get('destination')).toBe('Stop 4');
});
