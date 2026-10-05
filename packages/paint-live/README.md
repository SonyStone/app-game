# paint-live

The relay of live drawing sessions: an author draws in Paint and viewers watch, through rooms on a small WebSocket
server for Bun. The relay forwards the author's binary frames to every viewer or to one, and viewers' frames to the
author, without reading them; Paint decides what the frames hold.

- `src/envelope.ts`: the wire format and the relay's notices (`welcome`, `viewers`, `joined`, `left`, `author`,
  `refused`).
- `src/relay.ts`: rooms, roles and routing, independent of the server runtime; frames cross server instances through a
  `LiveBus`.
- `src/buses.ts`: `memoryBus` for one process, `redisBus` for instances that share nothing but Redis.
- `src/server.ts`: `Bun.serve` options for the relay.
- `src/client.ts`: the browser's connection, which reconnects on its own.

## Running locally

```sh
pnpm --filter @app-game/paint-live dev   # ws://0.0.0.0:3121, PAINT_LIVE_PORT to change
```

Bun is a dev dependency of this package (its install script downloads the binary; `pnpm-workspace.yaml` allows it), so
nothing needs installing globally. One process holds every room in memory, which also serves a tablet on the same
network.

## Vercel

`api/server.ts` at the repository root runs the relay as one Bun Function at `/api/server` (`bunVersion` in
`vercel.json`; the SPA rewrite leaves `/api/` alone). Vercel may route a room's connections to different instances,
so rooms go through Redis: add Upstash for Redis from the Vercel Marketplace, which sets `REDIS_URL` (`KV_URL` works
too). Without Redis, each instance keeps its own rooms.

A WebSocket on Vercel closes when its Function reaches its maximum duration; the client reconnects, and every new
connection receives `welcome` again, after which the author sends the drawing anew. WebSockets and the Bun runtime are
in beta on Vercel.

## Tests

```sh
pnpm --filter @app-game/paint-live test
```

`relay.test.ts` runs rooms over both buses (Redis through an in-memory stand-in); `server.test.ts` starts the real
relay with Bun and connects authors and viewers through the browser client.
