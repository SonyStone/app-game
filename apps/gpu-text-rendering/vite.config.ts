import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import typegpu from 'unplugin-typegpu/vite';
import { defineConfig, type Plugin } from 'vite';
import solid from 'vite-plugin-solid';

/** Standalone viewer build; the web host also compiles the exported source with Solid and TypeGPU. */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [solid(), typegpu(), performanceBridge()],
  worker: {
    format: 'es',
    plugins: () => [solid()]
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 0
  }
});

/**
 * Serves live frame-cost reports from every open viewer tab during `vite dev`, so agents can read what the running app
 * measures without driving a browser:
 *
 * - `GET /__performance` returns `{ pages: PerformanceReport[] }`, one per tab that answered within a second; add
 *   `?samples` for per-frame records. Monitors appear only while enabled, from the ⋯ menu or `?performance`.
 * - `POST /__performance/reset` forgets recorded frames in every tab, to measure only what happens next.
 *
 * Requests travel over Vite's HMR websocket to `performanceReports.ts`, which answers with `window.gpuPerformance`.
 */
function performanceBridge(): Plugin {
  return {
    name: 'gpu-performance-bridge',
    apply: 'serve',
    configureServer(server) {
      const pending = new Map<string, (report: unknown) => void>();

      server.ws.on('gpu-performance:report', ({ id, report }: { id: string; report: unknown }) => {
        pending.get(id)?.(report);
      });

      server.middlewares.use('/__performance', (request, response) => {
        const url = new URL(request.url ?? '/', 'http://localhost');

        if (request.method === 'POST' && url.pathname === '/reset') {
          server.ws.send('gpu-performance:reset');
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
        // Pages that never load the viewer, such as browser-test harnesses, do not answer.
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

        server.ws.send('gpu-performance:request', { id, samples: url.searchParams.has('samples') });
      });
    }
  };
}
