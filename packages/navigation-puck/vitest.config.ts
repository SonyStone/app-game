import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

/**
 * Controller and binding tests use Solid's server build, whose signal writes are visible immediately.
 * Component tests render with the browser build in jsdom.
 */
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'controller', environment: 'node', include: ['test/**/*.test.ts'] } },
      {
        plugins: [solid()],
        resolve: { conditions: ['development', 'browser'] },
        test: { name: 'components', environment: 'jsdom', include: ['test/**/*.test.tsx'] }
      }
    ]
  }
});
