import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['browser'] },
  test: {
    environment: 'happy-dom',
    server: { deps: { inline: [/solid-js/, /@solid-primitives/] } },
    include: ['apps/web/src/gpu-text-rendering/tests/*.test.ts']
  }
});
