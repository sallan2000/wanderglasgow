import { test, expect } from '@playwright/test';
import { isolateWalkList, loadRows } from './admin-walks-network.mjs';

const walk = (id, title, theme = 'History') => ({
  id,
  title,
  subtitle: `${title} description`,
  theme,
  stops: [],
  distanceKm: 0,
  minutes: 0,
  start: '',
  published: false,
  updatedAt: `updated-${id}`,
});

async function resolveSave(page, index, saved) {
  await page.evaluate(({ index, saved }) => window.walkListFixture.resolveSave(index, saved), { index, saved });
}

test('saved walk updates its row, closes its editor, and does not close a replacement editor', async ({ page }) => {
  const verify = await isolateWalkList(page);
  await loadRows(page, [walk('walk-a', 'Riverside Route'), walk('walk-b', 'Museum Loop', 'Museums')]);

  await page.getByTestId('walk-button-edit-walk-a').click();
  await page.getByTestId('walk-input-title').fill('Riverside Route Updated');
  await page.getByTestId('walk-button-save-draft').click();
  await expect.poll(() => page.evaluate(() => window.walkListFixture.state.saveRequests.length)).toBe(1);
  await resolveSave(page, 0);

  await expect(page.getByTestId('walk-row-walk-a')).toContainText('Riverside Route Updated');
  await expect(page.getByTestId('walk-overlay-editor')).toHaveCount(0);
  await expect(page.getByTestId('walk-status-note')).toContainText('Riverside Route Updated was updated');

  await page.getByTestId('walk-button-edit-walk-a').click();
  await page.getByTestId('walk-input-title').fill('Riverside Route Revised Again');
  await page.getByTestId('walk-button-save-draft').click();
  await expect.poll(() => page.evaluate(() => window.walkListFixture.state.saveRequests.length)).toBe(2);

  // Trigger the parent edit callback while the first editor's save is pending,
  // simulating a newer editor instance replacing it before the old callback returns.
  await page.evaluate(() => document.querySelector('[data-testid="walk-button-edit-walk-b"]').click());
  await expect(page.getByTestId('walk-input-title')).toHaveValue('Museum Loop');
  await resolveSave(page, 1);

  await expect(page.getByTestId('walk-row-walk-a')).toContainText('Riverside Route Revised Again');
  await expect(page.getByTestId('walk-input-title')).toHaveValue('Museum Loop');
  await verify();
});

test('a late list refresh cannot overwrite a successfully saved walk', async ({ page }) => {
  const verify = await isolateWalkList(page);
  const original = walk('walk-a', 'Old Riverside Route');
  await loadRows(page, [original]);

  await page.getByTestId('walk-button-refresh').click();
  await expect.poll(() => page.evaluate(() => window.walkListFixture.state.listRequests.length)).toBe(2);
  await page.getByTestId('walk-button-edit-walk-a').click();
  await page.getByTestId('walk-input-title').fill('Saved Riverside Route');
  await page.getByTestId('walk-button-save-draft').click();
  await expect.poll(() => page.evaluate(() => window.walkListFixture.state.saveRequests.length)).toBe(1);
  await resolveSave(page, 0);

  await expect(page.getByTestId('walk-row-walk-a')).toContainText('Saved Riverside Route');
  await page.evaluate(rows => window.walkListFixture.resolveList(1, rows), [original]);
  await expect(page.getByTestId('walk-row-walk-a').locator('h3')).toHaveText('Saved Riverside Route');
  await verify();
});

test('a late list refresh cannot remove a newly added walk', async ({ page }) => {
  const verify = await isolateWalkList(page);
  const original = walk('walk-a', 'Riverside Route');
  await loadRows(page, [original]);

  await page.getByTestId('walk-button-refresh').click();
  await expect.poll(() => page.evaluate(() => window.walkListFixture.state.listRequests.length)).toBe(2);

  await page.getByTestId('walk-button-add').click();
  await page.getByTestId('walk-input-title').fill('New Riverside Walk');
  await page.getByTestId('walk-radio-category-history').click();
  await page.getByTestId('walk-button-save-draft').click();
  await expect.poll(() => page.evaluate(() => window.walkListFixture.state.saveRequests.length)).toBe(1);
  await resolveSave(page, 0);

  await expect(page.getByTestId('walk-row-new-walk-0')).toContainText('New Riverside Walk');
  await expect(page.getByTestId('walk-overlay-editor')).toHaveCount(0);

  await page.evaluate(rows => window.walkListFixture.resolveList(1, rows), [original]);
  await expect(page.getByTestId('walk-row-new-walk-0')).toContainText('New Riverside Walk');
  await expect(page.getByTestId('walk-row-walk-a')).toBeVisible();
  await verify();
});

test('a failed list refresh keeps saved walks visible and allows retry', async ({ page }) => {
  const verify = await isolateWalkList(page);
  const original = walk('walk-a', 'Riverside Route');
  const another = walk('walk-b', 'Museum Loop', 'Museums');
  await loadRows(page, [original]);

  await page.getByTestId('walk-button-refresh').click();
  await expect.poll(() => page.evaluate(() => window.walkListFixture.state.listRequests.length)).toBe(2);
  await page.evaluate(() => window.walkListFixture.rejectList(1, 'Refresh failed: permission denied.'));

  await expect(page.getByTestId('walk-row-walk-a')).toBeVisible();
  await expect(page.getByTestId('walk-status-list-error')).toContainText('Refresh failed: permission denied.');
  await expect(page.getByTestId('walk-button-retry-list')).toBeVisible();

  await page.getByTestId('walk-button-retry-list').click();
  await expect.poll(() => page.evaluate(() => window.walkListFixture.state.listRequests.length)).toBe(3);
  await expect(page.getByTestId('walk-status-list-error')).toHaveCount(0);
  await page.evaluate(rows => window.walkListFixture.resolveList(2, rows), [another]);

  await expect(page.getByTestId('walk-status-list-error')).toHaveCount(0);
  await expect(page.getByTestId('walk-row-walk-a')).toHaveCount(0);
  await expect(page.getByTestId('walk-row-walk-b')).toBeVisible();
  await verify();
});

test('a late list refresh cannot restore a successfully deleted walk', async ({ page }) => {
  const verify = await isolateWalkList(page);
  const deleted = walk('walk-a', 'Riverside Route');
  const remaining = walk('walk-b', 'Museum Loop', 'Museums');
  await loadRows(page, [deleted, remaining]);

  await page.getByTestId('walk-button-refresh').click();
  await expect.poll(() => page.evaluate(() => window.walkListFixture.state.listRequests.length)).toBe(2);

  await page.getByTestId('walk-button-delete-walk-a').click();
  await page.getByTestId('walk-button-confirm-delete').click();
  await expect.poll(() => page.evaluate(() => window.walkListFixture.state.deleteRequests.length)).toBe(1);
  await page.evaluate(() => window.walkListFixture.resolveDelete(0));

  await expect(page.getByTestId('walk-row-walk-a')).toHaveCount(0);
  await expect(page.getByTestId('walk-row-walk-b')).toBeVisible();
  await expect(page.getByTestId('walk-status-note')).toHaveText('Riverside Route was deleted.');

  await page.evaluate(rows => window.walkListFixture.resolveList(1, rows), [deleted, remaining]);
  await expect(page.getByTestId('walk-row-walk-a')).toHaveCount(0);
  await expect(page.getByTestId('walk-row-walk-b')).toBeVisible();
  await verify();
});

test('failed delete keeps the confirmation open and explains the error', async ({ page }) => {
  const verify = await isolateWalkList(page);
  await loadRows(page, [walk('walk-a', 'Riverside Route')]);

  await page.getByTestId('walk-button-delete-walk-a').click();
  await expect(page.getByTestId('walk-dialog-delete')).toBeVisible();
  await page.getByTestId('walk-button-confirm-delete').click();
  await expect.poll(() => page.evaluate(() => window.walkListFixture.state.deleteRequests.length)).toBe(1);
  await page.evaluate(() => window.walkListFixture.rejectDelete(0, 'Delete failed: permission denied.'));

  await expect(page.getByTestId('walk-dialog-delete')).toBeVisible();
  await expect(page.getByTestId('walk-status-delete-error')).toHaveText('Delete failed: permission denied.');
  await expect(page.getByTestId('walk-row-walk-a')).toBeVisible();
  await verify();
});

test('successful delete removes only the selected walk', async ({ page }) => {
  const verify = await isolateWalkList(page);
  await loadRows(page, [walk('walk-a', 'Riverside Route'), walk('walk-b', 'Museum Loop', 'Museums')]);

  await page.getByTestId('walk-button-delete-walk-a').click();
  await page.getByTestId('walk-button-confirm-delete').click();
  await expect.poll(() => page.evaluate(() => window.walkListFixture.state.deleteRequests.length)).toBe(1);
  await page.evaluate(() => window.walkListFixture.resolveDelete(0));

  await expect(page.getByTestId('walk-dialog-delete')).toHaveCount(0);
  await expect(page.getByTestId('walk-row-walk-a')).toHaveCount(0);
  await expect(page.getByTestId('walk-row-walk-b')).toBeVisible();
  await verify();
});

test('filtering and reopening a saved walk shows its current data', async ({ page }) => {
  const verify = await isolateWalkList(page);
  await loadRows(page, [walk('walk-a', 'Riverside Route'), walk('walk-b', 'Museum Loop', 'Museums')]);

  await page.getByTestId('walk-button-edit-walk-a').click();
  await page.getByTestId('walk-input-title').fill('Updated Riverside Route');
  await page.getByTestId('walk-button-save-draft').click();
  await expect.poll(() => page.evaluate(() => window.walkListFixture.state.saveRequests.length)).toBe(1);
  await resolveSave(page, 0);
  await expect(page.getByTestId('walk-overlay-editor')).toHaveCount(0);

  await page.getByTestId('walk-input-search').fill('Updated Riverside');
  await page.getByTestId('walk-select-theme').selectOption('History');
  await page.getByTestId('walk-select-status').selectOption('Draft');
  await expect(page.getByTestId('walk-row-walk-a')).toBeVisible();
  await expect(page.getByTestId('walk-row-walk-b')).toHaveCount(0);

  await page.getByTestId('walk-button-edit-walk-a').click();
  await expect(page.getByTestId('walk-input-title')).toHaveValue('Updated Riverside Route');
  await verify();
});