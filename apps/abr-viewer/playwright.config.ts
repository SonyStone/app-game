import { defineConfig } from '@playwright/test';

/** Exercises the imported viewer through the shared app-game development server. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3120',
    viewport: { width: 1440, height: 1000 },
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'pnpm --dir ../.. exec vite --host 127.0.0.1 --port 3120 --strictPort',
    url: 'http://127.0.0.1:3120',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
