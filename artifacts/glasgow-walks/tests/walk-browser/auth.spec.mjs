import { test, expect } from '@playwright/test';

const forbiddenSetupCopy = /\bsql\b|setup\.sql|project owner|supabase sql editor/i;

async function expectCleanAuthScreen(page, heading) {
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  await expect(page.getByTestId('link-visitor-site')).toBeVisible();
  await expect(page.getByTestId('link-visitor-site')).toHaveAttribute('href', '/');
  await expect(page.getByText(forbiddenSetupCopy)).toHaveCount(0);
}

test('admin auth sign-in and password reset omit owner setup disclosure', async ({ page }) => {
  await page.goto('/tests/walk-browser/auth.html');

  await expectCleanAuthScreen(page, 'Sign in');
  await page.getByTestId('button-toggle-forgot').click();
  await expectCleanAuthScreen(page, 'Reset your password');
  await page.getByTestId('button-toggle-forgot').click();
  await expectCleanAuthScreen(page, 'Sign in');
});

test('admin auth toggle and visitor link stay usable and separated on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/tests/walk-browser/auth.html');
  await expectCleanAuthScreen(page, 'Sign in');

  const toggle = page.getByTestId('button-toggle-forgot');
  const visitorLink = page.getByTestId('link-visitor-site');
  await toggle.scrollIntoViewIfNeeded();
  await expect(toggle).toBeInViewport();
  await toggle.click();
  await expectCleanAuthScreen(page, 'Reset your password');
  await expect(toggle).toContainText('Back to sign in');
  await toggle.scrollIntoViewIfNeeded();
  await expect(toggle).toBeInViewport();
  await toggle.click();
  await expectCleanAuthScreen(page, 'Sign in');
  await expect(toggle).toContainText('Forgot your password?');

  await visitorLink.scrollIntoViewIfNeeded();
  await expect(visitorLink).toBeInViewport();
  const spacing = await page.evaluate(() => {
    const toggleBounds = document.querySelector('[data-testid="button-toggle-forgot"]').getBoundingClientRect();
    const linkBounds = document.querySelector('[data-testid="link-visitor-site"]').getBoundingClientRect();
    return { gap: linkBounds.top - toggleBounds.bottom, viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth };
  });
  expect(spacing.gap).toBeGreaterThanOrEqual(12);
  expect(spacing.gap).toBeLessThanOrEqual(30);
  expect(spacing.documentWidth).toBeLessThanOrEqual(spacing.viewportWidth);
});