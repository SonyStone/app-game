import solid from 'vite-plugin-solid';
import solidSvg from 'vite-plugin-solid-svg';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [solid(), solidSvg({ svgo: { enabled: false } })],
  resolve: { conditions: ['development', 'browser'] },
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { pretendToBeVisual: true } },
    include: ['test/**/*.test.{ts,tsx}'],
    server: { deps: { inline: [/solid-js/, /@solidjs/, /@solid-primitives/] } }
  }
});
