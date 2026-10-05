import UnoCSS from '@unocss/vite';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import typegpu from 'unplugin-typegpu/vite';
import { defineConfig, type Plugin } from 'vite';
import solid from 'vite-plugin-solid';
import { VitePWA } from 'vite-plugin-pwa';
import { recordingBridge } from './recordingBridge';
import type { PaintBuild } from './src/features/pwa/buildInfo';

/** A standalone production build keeps the editor independent of unrelated playground experiments. */
export default defineConfig(({ command }) => ({
  define: { __PAINT_BUILD__: JSON.stringify(buildInfo(command === 'serve')) },
  plugins: [
    solid(), typegpu(), UnoCSS({ configFile: fileURLToPath(new URL('../../uno.config.ts', import.meta.url)) }),
    performanceBridge(),
    recordingBridge(),
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
        // Precache the editor, the drawing worker and color-management WASM.
        // ABR parser runtimes are cached after their first use, preserving lazy loading.
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

/**
 * Serves live frame-cost reports from every open editor tab during `vite dev`, so agents can read what the running
 * editor measures without driving a browser:
 *
 * - `GET /__performance` returns `{ pages: PerformanceReport[] }`, one per tab that answered within a second; add
 *   `?samples` for per-frame records. Monitors appear only while enabled, from the Developer dialog or `?performance`.
 * - `POST /__performance/reset` forgets recorded frames in every tab, to measure only what happens next.
 *
 * Requests travel over Vite's HMR websocket on the `paint-performance` channel to
 * `src/features/performance/paintPerformance.ts`, which answers with `window.paintPerformance`.
 */
function performanceBridge(): Plugin {
  return {
    name: 'paint-performance-bridge',
    apply: 'serve',
    configureServer(server) {
      const pending = new Map<string, (report: unknown) => void>();

      server.ws.on('paint-performance:report', ({ id, report }: { id: string; report: unknown }) => {
        pending.get(id)?.(report);
      });

      server.middlewares.use('/__performance', (request, response) => {
        const url = new URL(request.url ?? '/', 'http://localhost');

        if (request.method === 'POST' && url.pathname === '/reset') {
          server.ws.send('paint-performance:reset');
          response.statusCode = 204;
          response.end();
          return;
        }

        if (request.method !== 'GET' || url.pathname !== '/') {
          response.statusCode = 404;
          response.end();
          return;
        }

        const id = randomUUID();
        const pages: unknown[] = [];
        const expected = server.ws.clients.size;
        const finish = () => {
          clearTimeout(timeout);
          pending.delete(id);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({ pages }, null, 2));
        };
        // Clients that never load the editor, such as test harness pages, do not answer.
        const timeout = setTimeout(finish, 1000);

        pending.set(id, (report) => {
          pages.push(report);

          if (pages.length >= expected) {
            finish();
          }
        });

        if (expected === 0) {
          finish();
          return;
        }

        server.ws.send('paint-performance:request', { id, samples: url.searchParams.has('samples') });
      });
    }
  };
}

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
