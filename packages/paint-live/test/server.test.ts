import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { openLiveConnection, type LiveConnection, type LiveStatus } from '../src/client';
import type { RelayNotice } from '../src/envelope';

let relay: ChildProcess;
let url: string;

beforeAll(async () => {
  const port = await freePort();
  url = `ws://127.0.0.1:${port}`;
  relay = spawn(fileURLToPath(new URL('../node_modules/.bin/bun', import.meta.url)), ['src/serve.ts'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, PAINT_LIVE_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'ignore']
  });
  await new Promise<void>((resolve) => relay.stdout!.once('data', () => resolve()));
});

afterAll(async () => {
  const exited = new Promise((resolve) => relay.once('exit', resolve));
  relay.kill();
  relay.stdout?.destroy();
  await exited;
});

it('carries an author to viewers through the Bun relay, and refuses a second key', async () => {
  const key = 'author-key-0123456789';
  const author = join('author', key);
  const viewer = join('viewer');
  await until(() => author.notices.some((notice) => notice.type === 'joined'));
  const joined = author.notices.find((notice) => notice.type === 'joined') as { peer: string };

  author.connection.send(new Uint8Array([1, 2, 3]));
  author.connection.send(new Uint8Array([4]), { kind: 'peer', peer: joined.peer });
  await until(() => viewer.payloads.length === 2);
  expect(viewer.payloads).toEqual([new Uint8Array([1, 2, 3]), new Uint8Array([4])]);

  viewer.connection.send(new Uint8Array([9, 9]));
  await until(() => author.payloads.length === 1);
  expect(author.payloads[0]).toEqual({ peer: joined.peer, payload: new Uint8Array([9, 9]) });

  // Another key cannot take the room; the connection learns why and stops.
  const intruder = join('author', 'another-key-0123456789');
  await until(() => intruder.statuses.at(-1) === 'closed');
  expect(intruder.notices).toEqual([{ type: 'refused', reason: 'This room belongs to another author.' }]);

  viewer.connection.close();
  await until(() => author.notices.some((notice) => notice.type === 'left'));
  author.connection.close();
});

/** Connects to room `livetest1` as `role`, collecting what arrives. */
function join(role: 'author' | 'viewer', key?: string) {
  const notices: RelayNotice[] = [];
  const payloads: unknown[] = [];
  const statuses: LiveStatus[] = [];
  const connection: LiveConnection = openLiveConnection({
    url,
    room: 'livetest1',
    role,
    ...(key ? { key } : {}),
    onNotice: (notice) => notices.push(notice),
    onPayload: (payload, peer) => payloads.push(peer ? { peer, payload: payload.slice() } : payload.slice()),
    onStatus: (status) => statuses.push(status)
  });
  return { connection, notices, payloads, statuses };
}

async function until(condition: () => boolean) {
  for (let i = 0; i < 200 && !condition(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  expect(condition()).toBe(true);
}

function freePort() {
  return new Promise<number>((resolve) => {
    const server = createServer().listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}
