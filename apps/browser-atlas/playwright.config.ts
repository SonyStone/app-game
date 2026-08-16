import { defineConfig } from '@playwright/test';

/** Runs Browser Atlas extension tests serially against one isolated Chromium profile per test. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: { trace: 'retain-on-failure' },
  webServer: {
    command: 'node e2e/test-server.mjs',
    url: 'http://127.0.0.1:3161/health',
    reuseExistingServer: false,
    timeout: 10_000
  }
});
