import UnoCSS from '@unocss/vite';
import { fileURLToPath } from 'node:url';
import typegpu from 'unplugin-typegpu/vite';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { VitePWA } from 'vite-plugin-pwa';

/** A standalone production build keeps the editor independent of unrelated playground experiments. */
export default defineConfig({
  plugins: [
    solid(), typegpu(), UnoCSS({ configFile: fileURLToPath(new URL('../../uno.config.ts', import.meta.url)) }),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      manifest: {
        id: '/', name: 'Paint Studio', short_name: 'Paint',
        description: 'An infinite canvas for drawing and painting.',
        start_url: '/', scope: '/', display: 'standalone',
        theme_color: '#344b66', background_color: '#faf8f5',
        icons: [
          { src: 'icons/paint-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/paint-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/paint-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Precache the complete editor, including lazy chunks, GPU workers and color-management WASM.
        // ABR example packs can be hundreds of MB; they are deliberately fetched only on demand.
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,ico,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/assets\//, /^\/icons\//],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: false
      }
    })
  ],
  server: { host: '0.0.0.0' },
  worker: { format: 'es', plugins: () => [solid(), typegpu()] },
  build: { target: 'esnext', outDir: fileURLToPath(new URL('./dist', import.meta.url)), emptyOutDir: true }
});
