import { defineConfig } from '@playwright/test';

const port = Number(process.env.PSD_E2E_PORT ?? 3131);

/** Drives the standalone viewer on its own port, so a running shared server is neither reused nor disturbed. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--enable-unsafe-webgpu']
    },
    trace: 'retain-on-failure'
  },
  webServer: {
    command: `node ../../node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60_000
  }
});
