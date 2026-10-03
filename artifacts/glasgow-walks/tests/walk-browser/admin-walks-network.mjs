import { expect } from '@playwright/test';

export async function isolateWalkList(page) {
  const unexpected = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' && url.port === '4180') {
      if (route.request().method() !== 'GET') {
        unexpected.push(`${route.request().method()} ${url.pathname}`);
        return route.abort();
      }
      return route.continue();
    }
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com')
      return route.fulfill({ contentType: 'text/css', body: '' });
    unexpected.push(`${url.origin}${url.pathname}`);
    return route.abort();
  });

  await page.goto('/tests/walk-browser/admin-walks.html');
  await expect.poll(() => page.evaluate(() => window.walkListFixture.state.listRequests.length)).toBe(1);

  return async () => {
    expect(unexpected, 'Walk-list tests must not contact Supabase or other services').toEqual([]);
    expect(errors, 'Walk list and editor should render without uncaught exceptions').toEqual([]);
  };
}

export async function loadRows(page, rows) {
  await page.evaluate(rows => window.walkListFixture.resolveList(0, rows), rows);
  await expect(page.getByTestId('walk-list')).toBeVisible();
}