import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
export default defineConfig({
  testDir: './tests/starting-areas', testMatch: '**/*.spec.mjs', workers: 1, retries: 0, timeout: 30000,
  outputDir: './test-results/starting-areas', reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4182', viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.WALK_TEST_CHROMIUM || (existsSync('/repl/tools/bin/chromium') ? '/repl/tools/bin/chromium' : undefined), args: ['--no-sandbox'] },
  },
  webServer: { command: 'node scripts/starting-area-browser-server.mjs', url: 'http://127.0.0.1:4182/tests/starting-areas/index.html', reuseExistingServer: false },
});