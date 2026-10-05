import { memoryBus } from './buses';
import { createLiveServer } from './server';

/**
 * Runs the live relay locally, in one process: `pnpm --filter @app-game/paint-live dev`. Listens on all interfaces, so
 * that a tablet on the same network reaches it, on `PAINT_LIVE_PORT` or 3121.
 */
const server = Bun.serve({
  ...createLiveServer(memoryBus()),
  hostname: '0.0.0.0',
  port: Number(process.env.PAINT_LIVE_PORT ?? 3121)
});

console.log(`paint-live relay on ws://${server.hostname}:${server.port}`);

// A running server keeps Bun alive on SIGTERM and SIGINT; stop it, so that test runs and Ctrl+C end the process.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    void server.stop(true);
    process.exit(0);
  });
}
