import type { RelayNotice } from './envelope';
import { createRelay, type LiveBus, type LiveSocketData } from './relay';

/**
 * Options for `Bun.serve` that run the live relay on `bus`: a WebSocket upgrade at any path, with the room, role and
 * author key in the query (see `Relay.admit`); a plain request gets a short status. A refused connection still opens,
 * so that the browser learns why: it gets a `refused` notice, closes, and is closed a second later if it stays. Locally `serve.ts` uses it with
 * `memoryBus`; on Vercel `api/server.ts` uses it with `redisBus`.
 */
export function createLiveServer(bus: LiveBus) {
  const relay = createRelay(bus);

  return {
    async fetch(request: Request, server: Bun.Server<SocketData>) {
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
        return Response.json({ service: 'paint-live', ok: true });
      }

      const admitted = await relay.admit(new URL(request.url));
      const data: SocketData = 'refused' in admitted ? { refused: admitted.refused } : admitted.data;
      return server.upgrade(request, { data })
        ? undefined
        : new Response('The connection could not be upgraded.', { status: 400 });
    },
    websocket: {
      // Tiles of a drawing can be large; Bun's default is 16 MiB.
      maxPayloadLength: 64 * 1024 * 1024,
      open(socket: Bun.ServerWebSocket<SocketData>) {
        const admitted = live(socket);
        if (admitted) {
          void relay.open(admitted);
          return;
        }

        const { refused } = socket.data as { refused: string };
        socket.send(JSON.stringify({ type: 'refused', reason: refused } satisfies RelayNotice));
        // The client closes on the notice; closing at once here could lose it, so only one that stays is closed.
        setTimeout(() => socket.close(4403, 'refused'), refusedCloseMs);
      },
      message(socket: Bun.ServerWebSocket<SocketData>, message: string | Buffer) {
        const admitted = live(socket);
        if (admitted) {
          relay.message(admitted, typeof message === 'string' ? message : new Uint8Array(message));
        }
      },
      close(socket: Bun.ServerWebSocket<SocketData>) {
        const admitted = live(socket);
        if (admitted) {
          void relay.close(admitted);
        }
      }
    }
  };
}

/** How long a refused connection may stay open after its notice before the relay closes it. */
const refusedCloseMs = 1000;

/** A connection's data: an admitted connection's, or why it was refused. */
type SocketData = LiveSocketData | { refused: string };

/** The connection, when it was admitted. */
function live(socket: Bun.ServerWebSocket<SocketData>) {
  return 'refused' in socket.data ? undefined : (socket as Bun.ServerWebSocket<LiveSocketData>);
}
