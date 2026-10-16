import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

/** Component and storage tests run in jsdom. */
export default defineConfig({
  plugins: [solid()],
  resolve: { conditions: ['development', 'browser'] },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] }
});
