import { test, expect } from '@playwright/test';
import { isolateEmail } from './network.mjs';

test('Open in Google Maps uses a cross-platform directions link with attraction names', async ({ page }) => {
  const state = await isolateEmail(page);
  await page.goto('/tests/email/index.html');
  await page.getByTestId('card-tour-fixture-curated').click();
  await page.getByTestId('section-itinerary-actions').waitFor({ state: 'visible', timeout: 5000 });
  const privacyNotice = page.getByTestId('text-itinerary-privacy');
  await expect(privacyNotice).toContainText('Planned walks also include the chosen start and calculated route, which may include GPS.');
  await expect(privacyNotice).toContainText('not your file or stop stories');
  expect((await privacyNotice.textContent()).length).toBeLessThan(300);

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

test('hero map identifies its dashed path as illustrative', async ({ page }) => {
  const state = await isolateEmail(page);
  await page.goto('/tests/email/index.html');
  await expect(page.locator('.hero-route-label')).toHaveText('Illustrative route');
  await expect(page.getByRole('img', { name: /dashed path is illustrative, not a pedestrian route/ })).toBeVisible();
  state.assertClean();
});

test('curated and planned walks share the same accurate route copy', async ({ page }) => {
  const state = await isolateEmail(page);
  await page.goto('/tests/email/index.html');
  await page.getByTestId('card-tour-fixture-curated').click();
  const curatedCopy = (await page.getByTestId('text-itinerary-privacy').innerText()).trim();
  await page.getByTestId('button-dismiss-detail').click();

  await page.getByTestId('button-mode-nearby').click();
  await page.getByTestId('button-plan-route').click();
  await expect(page.getByTestId('text-plan-summary')).toContainText('700 m');
  const plannedCopy = (await page.getByTestId('text-itinerary-privacy').innerText()).trim();
  expect(plannedCopy).toBe(curatedCopy);
  expect(plannedCopy).toContain('which may include GPS');
  state.assertClean();
});

test('curated walk details stay open until an explicit close button is used', async ({ page }) => {
  const state = await isolateEmail(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/tests/email/index.html');
  await page.getByTestId('card-tour-fixture-curated').click();

  const drawer = page.getByTestId('dialog-tour-fixture-curated');
  await expect(drawer).toBeVisible();
  expect(await drawer.evaluate(element => element.getBoundingClientRect().width)).toBe(900);
  await expect(page.getByTestId('button-close-detail')).toHaveCount(0);

  await page.getByTestId('overlay-tour-detail').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Escape');
  await expect(drawer).toBeVisible();

  await page.getByTestId('button-dismiss-detail').click();
  await expect(drawer).toHaveCount(0);

  await page.getByTestId('card-tour-fixture-curated').click();
  const reopenedDrawer = page.getByTestId('dialog-tour-fixture-curated');
  await expect(reopenedDrawer).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await reopenedDrawer.evaluate(element => element.getBoundingClientRect().width)).toBe(390);
  await reopenedDrawer.evaluate(element => { element.scrollTop = element.scrollHeight; });
  const closeAtBottom = page.getByTestId('button-close-detail-bottom');
  await expect(closeAtBottom).toBeInViewport();
  await closeAtBottom.click();
  await expect(reopenedDrawer).toHaveCount(0);

  state.assertClean();
});

test('long mobile routes show ordered Google Maps segments instead of an unsupported full link', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile',
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tests/email/navigation-fixture.html');

  await expect(page.getByTestId('route-navigation')).toHaveCount(0);

  const segmentLinks = [
    page.getByTestId('route-navigation-segment-1'),
    page.getByTestId('route-navigation-segment-2'),
  ];
  await expect(page.getByTestId('route-navigation-segments')).toContainText(
    'This route is split to fit Google Maps.',
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

test('mobile routes with three waypoints stay a single direct Google Maps link', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile',
    });
  });
  await page.goto('/tests/email/navigation-fixture.html?points=5');

  const directLink = page.getByTestId('route-navigation');
  await expect(directLink).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1/);
  await expect(page.getByTestId('route-navigation-segments')).toHaveCount(0);
  const url = new URL(await directLink.getAttribute('href'));
  expect(url.searchParams.get('waypoints')).toBe('Stop 1|Stop 2|Stop 3');
  expect(url.searchParams.get('destination')).toBe('Stop 4');
});

test('desktop routes use one Google Maps link up to nine waypoints', async ({ page }) => {
  await page.goto('/tests/email/navigation-fixture.html');

  const directLink = page.getByTestId('route-navigation');
  await expect(directLink).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1/);
  await expect(page.getByTestId('route-navigation-segments')).toHaveCount(0);
  expect(new URL(await directLink.getAttribute('href')).searchParams.get('waypoints'))
    .toBe('Stop 1|Stop 2|Stop 3|Stop 4|Stop 5');
});

test('desktop routes exceeding nine waypoints are split into supported parts', async ({ page }) => {
  await page.goto('/tests/email/navigation-fixture.html?points=12');

  await expect(page.getByTestId('route-navigation')).toHaveCount(0);
  const segments = page.getByTestId('route-navigation-segments');
  await expect(segments).toBeVisible();
  const first = new URL(await page.getByTestId('route-navigation-segment-1').getAttribute('href'));
  const second = new URL(await page.getByTestId('route-navigation-segment-2').getAttribute('href'));
  expect(first.searchParams.get('waypoints').split('|')).toHaveLength(9);
  expect(first.searchParams.get('destination')).toBe('Stop 10');
  expect(second.searchParams.get('origin')).toBe('Stop 10');
  expect(second.searchParams.get('destination')).toBe('Stop 11');
});
