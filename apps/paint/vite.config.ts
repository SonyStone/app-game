import { checkExampleAssets } from '../abr-viewer/scripts/check-example-assets.mjs';
import UnoCSS from '@unocss/vite';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import typegpu from 'unplugin-typegpu/vite';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { VitePWA } from 'vite-plugin-pwa';
import type { PaintBuild } from './src/pwa/buildInfo';

/** A standalone production build keeps the editor independent of unrelated playground experiments. */
export default defineConfig(({ command }) => ({
  define: { __PAINT_BUILD__: JSON.stringify(buildInfo(command === 'serve')) },
  plugins: [
    { name: 'validate-abr-examples', apply: 'build', buildStart: () => checkExampleAssets() },
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
        // Precache the editor, GPU workers and color-management WASM.
        // ABR implementations are cached after their first use, preserving lazy loading.
        // ABR example packs can be hundreds of MB; they are deliberately fetched only on demand.
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,ico,woff2,wasm}'],
        globIgnores: ['**/abr-js-runtime-*.js', '**/abr-wasm-runtime-*.js', '**/photoshop_abr_wasm_bg-*.wasm'],
        runtimeCaching: [{
          urlPattern: /\/(?:abr-(?:js|wasm)-runtime-[^/]+\.js|photoshop_abr_wasm_bg-[^/]+\.wasm)$/,
          handler: 'CacheFirst',
          options: { cacheName: 'abr-codecs', expiration: { maxEntries: 12 } }
        }],
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
}));

/** Embedded in the bundle so cached/offline clients identify their running build, not the latest deployment. */
function buildInfo(development: boolean): PaintBuild {
  const revision = process.env.VERCEL_GIT_COMMIT_SHA || git('rev-parse', 'HEAD');
  const changes = git('status', '--porcelain', '--untracked-files=normal');
  return {
    revision: revision && /^[a-f\d]{40,64}$/i.test(revision) ? revision : null,
    builtAt: new Date().toISOString(),
    development,
    localChanges: !process.env.VERCEL && !!changes
  };
}

/** Git may be absent from an exported source archive; the timestamp still identifies that build. */
function git(...args: string[]) {
  const result = spawnSync('git', args, {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8'
  });
  return result.status === 0 ? result.stdout.trim() : undefined;
}
