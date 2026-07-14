import solid from 'vite-plugin-solid';
import solidSvg from 'vite-plugin-solid-svg';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    solid(),
    solidSvg({
      svgo: {
        enabled: true,
        svgoConfig: {
          plugins: [
            {
              name: 'preset-default',
              params: {
                overrides: {
                  removeViewBox: false
                }
              }
            }
          ]
        }
      }
    })
  ],
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    setupFiles: ['./test/vitest.jest-dom-setup.ts']
  },
  resolve: {
    conditions: ['development', 'browser']
  }
});
