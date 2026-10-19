import { defineConfig } from '@playwright/test';

/** Drives the web playground on its own port, so a running shared server is neither reused nor disturbed. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:3133',
    viewport: { width: 1180, height: 820 },
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'pnpm --dir ../.. exec vite --config vite.config.ts --host 127.0.0.1 --port 3133 --strictPort',
    url: 'http://127.0.0.1:3133',
    reuseExistingServer: false,
    timeout: 120_000
  }
});
