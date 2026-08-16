import { defineConfig } from '@playwright/test';

/** Runs deterministic Browser Atlas mock-backend tests through the shared web route. */
export default defineConfig({
  testDir: './e2e-web',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'http://127.0.0.1:3120',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'pnpm --dir ../.. exec vite --config vite.config.ts',
    url: 'http://127.0.0.1:3120/browser-atlas',
    reuseExistingServer: true,
    timeout: 30_000
  }
});
