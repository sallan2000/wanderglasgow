import { test, expect } from '@playwright/test';
import { isolateEmail } from './network.mjs';

test('Open in Google Maps uses a cross-platform directions link with attraction names', async ({ page }) => {
  const state = await isolateEmail(page);
  await page.goto('/tests/email/index.html');
  await page.getByTestId('card-tour-fixture-curated').click();

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
      await expect(link).toHaveText('Open in Google Maps');

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
