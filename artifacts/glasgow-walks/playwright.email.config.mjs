import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
export default defineConfig({
  testDir: './tests/email', testMatch: '**/*.spec.mjs', workers: 1, retries: 0,
  timeout: 30000, expect: { timeout: 7000 }, outputDir: './test-results/email', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4185', viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.WALK_TEST_CHROMIUM || (existsSync('/repl/tools/bin/chromium') ? '/repl/tools/bin/chromium' : undefined), args: ['--no-sandbox'] } },
  webServer: { command: 'node scripts/email-browser-server.mjs', url: 'http://127.0.0.1:4185/tests/email/index.html', reuseExistingServer: false, timeout: 30000 },
});