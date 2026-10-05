import { test, expect } from '@playwright/test';

async function openFixture(page) {
  const state = {
    calls: [], categories: ['Art', 'History', 'Sport'],
    usage: [
      { category_name: 'Art', attraction_count: 1, curated_walk_count: 0 },
      { category_name: 'History', attraction_count: 3, curated_walk_count: 2 },
      { category_name: 'Sport', attraction_count: 2, curated_walk_count: 1 },
    ],
    missingFunction: false,
  };
  const cors = {
    'Access-Control-Allow-Origin': 'http://127.0.0.1:4185',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  page.on('pageerror', error => state.calls.push({ error: error.message }));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname !== 'supabase.fixture.invalid') return route.abort();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const functionName = url.pathname.split('/').at(-1);
    const params = route.request().method() === 'POST' ? route.request().postDataJSON() : undefined;
    if (!url.pathname.startsWith('/rest/v1/rpc/')) return route.abort();
    state.calls.push({ functionName, params });
    if (state.missingFunction) return route.fulfill({
      status: 404, headers: cors,
      body: JSON.stringify({ code: 'PGRST202', message: 'Function not found' }),
    });
    if (functionName === 'list_attraction_category_usage') return route.fulfill({
      status: 200, headers: cors, body: JSON.stringify(state.usage),
    });
    if (functionName === 'remove_attraction_category') {
      const source = state.usage.find(entry => entry.category_name === params.p_category_name);
      if (!source || !state.categories.includes(params.p_replacement_name)) return route.fulfill({
        status: 400, headers: cors, body: JSON.stringify({ code: 'P0002', message: 'Category unavailable.' }),
      });
      if (source.attraction_count !== params.p_expected_attractions ||
        source.curated_walk_count !== params.p_expected_curated_walks) return route.fulfill({
        status: 409, headers: cors, body: JSON.stringify({ code: '40001', message: 'Category usage changed.' }),
      });
      const destination = state.usage.find(entry => entry.category_name === params.p_replacement_name);
      const result = [{
        attractions_moved: source.attraction_count,
        curated_walks_moved: source.curated_walk_count,
      }];
      destination.attraction_count += source.attraction_count;
      destination.curated_walk_count += source.curated_walk_count;
      state.categories = state.categories.filter(category => category !== params.p_category_name);
      state.usage = state.usage.filter(entry => entry.category_name !== params.p_category_name);
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(result) });
    }
    return route.abort();
  });
  await page.goto('/tests/category-removal/index.html');
  await expect(page.getByTestId('category-usage-sport')).toHaveText('2 attractions · 1 curated walk');
  return state;
}

test('shows current use and requires a separate category-removal confirmation', async ({ page }) => {
  const state = await openFixture(page);
  const remove = page.getByTestId('button-remove-category-sport');
  await remove.click();
  const dialog = page.getByTestId('dialog-remove-category');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('2 attractions and 1 curated walk');
  await expect(dialog).toContainText('records and walk details will be preserved');
  await expect(page.getByTestId('button-confirm-remove-category')).toBeDisabled();
  await expect(page.getByTestId('button-cancel-remove-category')).toBeFocused();
  expect(state.calls.some(call => call.functionName === 'remove_attraction_category')).toBe(false);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(remove).toBeFocused();
  expect(state.categories).toContain('Sport');
});

test('moves attractions and curated walks together and refreshes the category list', async ({ page }) => {
  const state = await openFixture(page);
  await page.getByTestId('button-remove-category-sport').click();
  await page.getByTestId('select-category-replacement').selectOption('History');
  await expect(page.getByTestId('button-confirm-remove-category')).toBeEnabled();
  await page.getByTestId('button-confirm-remove-category').click();
  await expect(page.getByTestId('category-item-sport')).toHaveCount(0);
  await expect(page.getByTestId('category-usage-history')).toHaveText('5 attractions · 3 curated walks');
  await expect(page.getByText('Sport was removed. Moved 2 attractions and 1 curated walk to History.')).toBeVisible();
  expect(state.categories).not.toContain('Sport');
  expect(state.calls.filter(call => call.functionName === 'remove_attraction_category')).toEqual([{
    functionName: 'remove_attraction_category',
    params: {
      p_category_name: 'Sport',
      p_replacement_name: 'History',
      p_expected_attractions: 2,
      p_expected_curated_walks: 1,
    },
  }]);
  await expect(page.getByTestId('button-refresh-categories')).toBeFocused();
});

test('stops when the counts change and requires a fresh confirmation', async ({ page }) => {
  const state = await openFixture(page);
  await page.getByTestId('button-remove-category-sport').click();
  const sport = state.usage.find(entry => entry.category_name === 'Sport');
  sport.attraction_count = 3;
  sport.curated_walk_count = 2;
  await page.getByTestId('select-category-replacement').selectOption('History');
  await page.getByTestId('button-confirm-remove-category').click();
  await expect(page.getByTestId('status-remove-category-error')).toContainText('usage changed');
  await expect(page.getByTestId('category-usage-sport')).toHaveText('3 attractions · 2 curated walks');
  expect(state.categories).toContain('Sport');
  await page.getByTestId('button-confirm-remove-category').click();
  await expect(page.getByTestId('category-item-sport')).toHaveCount(0);
  expect(state.categories).not.toContain('Sport');
});

test('keeps removal disabled and points administrators to the safe database upgrade', async ({ page }) => {
  await page.route('https://supabase.fixture.invalid/rest/v1/rpc/list_attraction_category_usage', route =>
    route.fulfill({ status: 404, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'PGRST202', message: 'Function not found' }) }));
  await page.goto('/tests/category-removal/index.html');
  await expect(page.getByTestId('status-category-management-upgrade')).toContainText('Supabase SQL Editor');
  const upgradeLink = page.getByTestId('status-category-management-upgrade').getByRole('link');
  await expect(upgradeLink).toHaveAttribute('href', /categories-upgrade\.sql$/);
  await expect(upgradeLink).toHaveAttribute('download', 'categories-upgrade.sql');
  await expect(page.getByTestId('button-remove-category-sport')).toHaveCount(0);
  await page.getByTestId('input-category-name').fill('Architecture');
  await expect(page.getByTestId('button-save-category')).toBeEnabled();
});
