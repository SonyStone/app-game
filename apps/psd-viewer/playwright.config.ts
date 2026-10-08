import { defineConfig } from '@playwright/test';

/** Drives the standalone viewer on its own port, so a running shared server is neither reused nor disturbed. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3131',
    viewport: { width: 1440, height: 900 },
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 3131 --strictPort',
    url: 'http://127.0.0.1:3131',
    reuseExistingServer: false,
    timeout: 60_000
  }
});
