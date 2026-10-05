import { describe, expect, it } from 'vitest';
import { decodeBusMessage, encodeBusMessage, memoryBus, redisBus } from '../src/buses';
import { addressFrame, readFromPeer, type RelayNotice } from '../src/envelope';
import { createRelay, type LiveBus, type LiveSocket } from '../src/relay';

describe.each([
  ['memory', () => memoryBus()],
  ['Redis', () => fakeRedisBus()]
] as const)('relay over the %s bus', (_, makeBus) => {
  it('carries the author to every viewer or one, and viewers to the author, with notices', async () => {
    const bus = makeBus();
    // Two relays on one bus stand for two server instances.
    const relays = [createRelay(bus), createRelay(bus)];
    const author = await connect(relays[0]!, 'room123', 'author', 'k'.repeat(16));
    const first = await connect(relays[1]!, 'room123', 'viewer');
    const second = await connect(relays[0]!, 'room123', 'viewer');
    await settle();
    expect(first.notices[0]).toMatchObject({ type: 'welcome', role: 'viewer', viewers: 1, author: true });
    expect(author.notices).toContainEqual({ type: 'joined', peer: first.socket.data.peer });
    expect(author.notices.at(-1)).toEqual({ type: 'viewers', count: 2 });

    relays[0]!.message(author.socket, addressFrame({ kind: 'viewers' }, bytes(1, 2)));
    relays[0]!.message(author.socket, addressFrame({ kind: 'peer', peer: second.socket.data.peer }, bytes(3)));
    await settle();
    expect(first.payloads).toEqual([bytes(1, 2)]);
    expect(second.payloads).toEqual([bytes(1, 2), bytes(3)]);

    relays[1]!.message(first.socket, bytes(9));
    await settle();
    expect(readFromPeer(author.payloads[0]!)).toEqual({ peer: first.socket.data.peer, payload: bytes(9) });

    await relays[1]!.close(first.socket);
    await relays[0]!.close(author.socket);
    await settle();
    expect(author.notices).toContainEqual({ type: 'left', peer: first.socket.data.peer });
    expect(second.notices).toContainEqual({ type: 'viewers', count: 1 });
    expect(second.notices.at(-1)).toEqual({ type: 'author', present: false });
  });

  it('keeps a room for the author who claimed it, and refuses bad requests', async () => {
    const relay = createRelay(makeBus());
    const admit = (query: string) => relay.admit(new URL(`ws://relay/?${query}`));
    expect(await admit(`room=room123&role=author&key=${'a'.repeat(16)}`)).toHaveProperty('data');
    expect(await admit(`room=room123&role=author&key=${'a'.repeat(16)}`)).toHaveProperty('data');
    expect(await admit(`room=room123&role=author&key=${'b'.repeat(16)}`)).toEqual({
      refused: 'This room belongs to another author.'
    });
    expect(await admit('room=room123&role=author&key=short')).toHaveProperty('refused');
    expect(await admit('room=Bad!&role=viewer')).toHaveProperty('refused');
    expect(await admit('room=room123&role=owner')).toHaveProperty('refused');
    expect(await admit('room=room123&role=viewer')).toHaveProperty('data.role', 'viewer');
  });
});

it('sends bus messages through text, payloads in base64', () => {
  const message = { kind: 'peer', peer: 'abc', payload: bytes(0, 255, 7) } as const;
  expect(decodeBusMessage(encodeBusMessage(message))).toEqual(message);
  const notice = { kind: 'notice', to: 'all', notice: { type: 'viewers', count: 2 } } as const;
  expect(decodeBusMessage(encodeBusMessage(notice))).toEqual(notice);
});

/** Connects a fake socket through `relay`, collecting what it receives. */
async function connect(relay: ReturnType<typeof createRelay>, room: string, role: 'author' | 'viewer', key = '') {
  const admitted = await relay.admit(new URL(`ws://relay/?room=${room}&role=${role}&key=${key}`));
  if (!('data' in admitted)) {
    throw new Error(admitted.refused);
  }

  const notices: RelayNotice[] = [];
  const payloads: Uint8Array[] = [];
  const socket: LiveSocket = {
    data: admitted.data,
    send(data) {
      if (typeof data === 'string') {
        notices.push(JSON.parse(data) as RelayNotice);
      } else {
        payloads.push(new Uint8Array(data));
      }
    }
  };
  await relay.open(socket);
  return { socket, notices, payloads };
}

/** A Redis bus over an in-memory Redis that delivers published messages a moment later, as a server would. */
function fakeRedisBus(): LiveBus {
  const strings = new Map<string, string>();
  const channels = new Map<string, Set<(message: string, channel: string) => void>>();
  return redisBus({
    commands: {
      async publish(channel, message) {
        for (const listener of channels.get(channel) ?? []) {
          queueMicrotask(() => listener(message, channel));
        }
      },
      async send(command, [key, value, ...rest]) {
        if (command === 'SET') {
          if (!(rest.includes('NX') && strings.has(key!))) {
            strings.set(key!, value!);
          }

          return 'OK';
        }

        if (command === 'GET') {
          return strings.get(key!) ?? null;
        }

        if (command === 'INCRBY') {
          const next = Number(strings.get(key!) ?? 0) + Number(value);
          strings.set(key!, String(next));
          return next;
        }

        return 1;
      }
    },
    subscriber: {
      async subscribe(channel, listener) {
        const set = channels.get(channel) ?? new Set();
        channels.set(channel, set);
        set.add(listener);
      },
      async unsubscribe(channel) {
        channels.delete(channel);
      }
    }
  });
}

function bytes(...values: number[]) {
  return new Uint8Array(values);
}

/** Lets microtasks and timers run, so that bus deliveries arrive. */
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 5));
}
