import { test, expect } from '@playwright/test';
import { isolateEmail, openCurated, fillEmail } from './network.mjs';

test('curated email: consent, validation, single recipient and provider acceptance', async ({ page }) => {
  const state = await isolateEmail(page);
  await openCurated(page);
  const input = page.getByTestId('input-email-walk');
  await expect(input).toBeFocused();
  await expect(page.getByTestId('checkbox-email-consent')).not.toBeChecked();
  await expect(page.getByTestId('form-email-walk')).toContainText('only the published itinerary');
  await expect(page.getByTestId('form-email-walk')).toContainText('does not include a GPS connector');
  await input.fill('not an address'); await page.getByTestId('button-email-send').click();
  await expect(page.getByTestId('error-email-field')).toContainText('valid email');
  await input.fill('myself@example.invalid'); await page.getByTestId('button-email-send').click();
  await expect(page.getByTestId('error-email-field')).toContainText('Tick the box');
  await page.getByTestId('checkbox-email-consent').check(); await page.getByTestId('button-email-send').click();
  await expect(page.getByTestId('error-email-field')).toContainText('security check');
  expect(state.sends).toHaveLength(0);
  await page.getByTestId('fixture-security-check').click(); await page.getByTestId('button-email-send').click();
  await expect(page.getByTestId('status-email-success')).toContainText('accepted');
  await expect(page.getByTestId('status-email-success')).toContainText('does not guarantee');
  expect(state.sends).toHaveLength(1);
  expect(state.sends[0].walk).toEqual({ kind: 'curated', walkId: 'fixture-curated' });
  expect(state.sends[0].consent).toBe(true);
  await expect(input).toHaveValue(''); await expect(page.getByTestId('checkbox-email-consent')).not.toBeChecked();
  expect(await page.evaluate(() => Object.keys(localStorage).some(k => /email|walk-route/i.test(k)))).toBe(false);
  state.assertClean();
});

test('completed real planner email includes only ordered stops, origin and totals despite failed map', async ({ page }) => {
  const state = await isolateEmail(page);
  await page.goto('/tests/email/index.html');
  await page.getByTestId('button-mode-nearby').click();
  await page.getByTestId('button-plan-route').click();
  await expect(page.getByTestId('text-plan-summary')).toContainText('700 m');
  await page.getByTestId('button-email-walk').click();
  await expect(page.getByTestId('form-email-walk')).toContainText('precise start coordinates');
  await fillEmail(page); await page.getByTestId('button-email-send').click();
  await expect(page.getByTestId('status-email-success')).toBeVisible();
  expect(state.sends[0].walk).toEqual({ kind: 'planned', origin: { lat: 55.8625, lon: -4.249 },
    stopIds: ['fixture-stop-1', 'fixture-stop-2'], distanceMeters: 700, durationSeconds: 550 });
  await expect(page.getByTestId('text-plan-summary')).toContainText('700 m');
  state.assertClean();
});

test('pending guards duplicates; failures retain edits and retry uses a fresh captcha with the same reference', async ({ page }) => {
  const state = await isolateEmail(page);
  let release;
  state.send = async (route, headers) => {
    await new Promise(resolve => { release = resolve; });
    await route.fulfill({ status: 502, headers, body: '{"code":"delivery_unconfirmed"}' });
  };
  await openCurated(page); await fillEmail(page);
  await page.getByTestId('button-email-send').click();
  await expect.poll(() => state.sends.length).toBe(1);
  await expect(page.getByTestId('input-email-walk')).toBeDisabled();
  await expect(page.getByTestId('button-email-cancel')).toBeDisabled();
  await page.getByTestId('form-email-walk').evaluate(form => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(state.sends).toHaveLength(1);
  release();
  await expect(page.getByTestId('error-email-send')).toContainText('could not confirm');
  await expect(page.getByTestId('input-email-walk')).toHaveValue('myself@example.invalid');
  await expect(page.getByTestId('checkbox-email-consent')).toBeChecked();
  await page.getByTestId('button-email-send').click();
  await expect(page.getByTestId('error-email-field')).toContainText('security check');
  expect(state.sends).toHaveLength(1);
  state.send = null;
  await page.getByTestId('fixture-security-check').click(); await page.getByTestId('button-email-send').click();
  await expect(page.getByTestId('status-email-success')).toBeVisible();
  expect(state.sends[0].requestId).toBe(state.sends[1].requestId);
  expect(state.sends[0].token).not.toBe(state.sends[1].token);
  state.assertClean();
});

test('expired verification does not send; blocked script can retry', async ({ page }) => {
  const state = await isolateEmail(page); state.securityFails = true;
  await openCurated(page);
  await expect(page.getByText('The security check could not load.', { exact: false })).toBeVisible();
  state.securityFails = false;
  await page.getByRole('button', { name: 'Retry security check' }).click();
  await fillEmail(page);
  await page.evaluate(() => window.expireFixtureSecurity());
  await page.getByTestId('button-email-send').click();
  await expect(page.getByTestId('error-email-field')).toContainText('security check');
  expect(state.sends).toHaveLength(0);
  await page.getByTestId('fixture-security-check').click(); await page.getByTestId('button-email-send').click();
  await expect(page.getByTestId('status-email-success')).toBeVisible();
  state.assertClean();
});

test('missing configuration and malformed success never claim delivery', async ({ page }) => {
  const state = await isolateEmail(page);
  await openCurated(page, '?unconfigured');
  await expect(page.getByTestId('status-email-unavailable')).toContainText('not switched on');
  expect(state.securityLoads).toBe(0); expect(state.sends).toHaveLength(0);
  await page.getByRole('button', { name: 'Close email form' }).click();
  await expect(page.getByTestId('button-email-walk')).toBeFocused();
  await openCurated(page);
  state.send = (route, headers) => route.fulfill({ status: 200, headers, body: '{}' });
  await fillEmail(page); await page.getByTestId('button-email-send').click();
  await expect(page.getByTestId('error-email-send')).toContainText('could not confirm');
  await expect(page.getByTestId('status-email-success')).toHaveCount(0);
  state.assertClean();
});

test('keyboard and mobile form fit the drawer and Escape restores focus', async ({ page }) => {
  const state = await isolateEmail(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await openCurated(page);
  await page.getByTestId('input-email-walk').press('Escape');
  await expect(page.getByTestId('button-email-walk')).toBeFocused();
  await page.getByTestId('button-email-walk').press('Enter');
  await expect(page.getByTestId('input-email-walk')).toBeFocused();
  await fillEmail(page);
  expect(await page.getByTestId('form-email-walk').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.getByTestId('form-email-walk').evaluate(node => node.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: 'test-results/email/email-form-mobile.jpg', fullPage: false });
  await page.getByTestId('button-email-send').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('status-email-success')).toBeVisible();
  state.assertClean();
});

test('rate-limit and deployment failures are actionable without removing the walk', async ({ page }) => {
  const state = await isolateEmail(page);
  await openCurated(page);
  for (const [code, status, text] of [['rate_limited', 429, 'wait an hour'], ['setup_required', 503, 'not enabled yet']]) {
    state.send = (route, headers) => route.fulfill({ status, headers, body: JSON.stringify({ code }) });
    await fillEmail(page); await page.getByTestId('button-email-send').click();
    await expect(page.getByTestId('error-email-send')).toContainText(text);
    await expect(page.getByTestId('input-email-walk')).toHaveValue('myself@example.invalid');
    await expect(page.getByTestId('status-email-success')).toHaveCount(0);
    await expect(page.getByTestId('form-email-walk')).toContainText('Fixture editorial Glasgow');
  }
  state.assertClean();
});

test('leaving a pending route ignores its late result and starts a fresh form for a new route', async ({ page }) => {
  const state = await isolateEmail(page);
  let release;
  state.send = async (route, headers) => {
    await new Promise(resolve => { release = resolve; });
    await route.fulfill({ status: 200, headers, body: '{"status":"accepted"}' }).catch(() => {});
  };
  await page.goto('/tests/email/index.html');
  await page.getByTestId('button-mode-nearby').click(); await page.getByTestId('button-plan-route').click();
  await page.getByTestId('button-email-walk').click(); await fillEmail(page);
  await page.getByTestId('button-email-send').click();
  await expect.poll(() => state.sends.length).toBe(1);
  await page.getByTestId('button-radius-3').click();
  await expect(page.getByTestId('form-email-walk')).toHaveCount(0);
  release(); state.send = null;
  await page.getByTestId('button-plan-route').click();
  await page.getByTestId('button-email-walk').click();
  await expect(page.getByTestId('input-email-walk')).toHaveValue('');
  await expect(page.getByTestId('status-email-success')).toHaveCount(0);
  await fillEmail(page); await page.getByTestId('button-email-send').click();
  await expect(page.getByTestId('status-email-success')).toBeVisible();
  expect(state.sends[0].requestId).not.toBe(state.sends[1].requestId);
  state.assertClean();
});