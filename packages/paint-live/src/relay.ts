import { fromPeer, readAddressed, roomPattern, type RelayNotice, type Role } from './envelope';

/**
 * The relay of live drawing sessions, independent of the server runtime: a room has one author, who draws, and any
 * number of viewers. Frames from the author go to every viewer or to one; frames from a viewer go to the author. The
 * relay forwards their payloads without reading them, and tells connections who joins and leaves (`RelayNotice`).
 *
 * Every frame goes through `bus`, also between connections of one server instance, so that rooms work alike whether
 * all their connections reach one instance or, as on Vercel, several (see `redisBus`). The author proves the room is
 * theirs with a `key` they choose when they first connect; later author connections must bring the same key.
 */
export function createRelay(bus: LiveBus) {
  const rooms = new Map<string, { sockets: Set<LiveSocket>; unsubscribe: () => void }>();

  return {
    /**
     * Decides whether a connection request may open: `room`, `role` and, for the author, `key` from the query of
     * `url`. Returns the connection's data, or why it is refused.
     */
    async admit(url: URL): Promise<{ data: LiveSocketData } | { refused: string }> {
      const room = url.searchParams.get('room') ?? '';
      const role = url.searchParams.get('role');
      if (!roomPattern.test(room)) {
        return { refused: 'A room id is 6 to 32 lower-case letters and digits.' };
      }

      if (role !== 'author' && role !== 'viewer') {
        return { refused: 'Connect as the author or as a viewer.' };
      }

      if (role === 'author') {
        const key = url.searchParams.get('key') ?? '';
        if (key.length < 16) {
          return { refused: 'The author needs a key of at least 16 characters.' };
        }

        if (!(await bus.claimAuthor(room, await digest(key)))) {
          return { refused: 'This room belongs to another author.' };
        }
      }

      return { data: { room, role, peer: crypto.randomUUID().slice(0, 8) } };
    },
    /** A connection opened: it joins its room, and the room learns of it. */
    async open(socket: LiveSocket) {
      const { room, role, peer } = socket.data;
      join(socket);
      const viewers = await bus.count(room, 'viewer', role === 'viewer' ? 1 : 0);
      const authors = await bus.count(room, 'author', role === 'author' ? 1 : 0);
      send(socket, { type: 'welcome', peer, role, viewers, author: authors > 0 });
      if (role === 'viewer') {
        bus.publish(room, { kind: 'notice', to: 'author', notice: { type: 'joined', peer } });
        bus.publish(room, { kind: 'notice', to: 'all', notice: { type: 'viewers', count: viewers } });
      } else {
        bus.publish(room, { kind: 'notice', to: 'viewers', notice: { type: 'author', present: true } });
      }
    },
    /** A binary frame arrived; text frames are ignored, since only the relay speaks in text. */
    message(socket: LiveSocket, frame: Uint8Array | string) {
      if (typeof frame === 'string') {
        return;
      }

      const { room, role, peer } = socket.data;
      if (role === 'viewer') {
        bus.publish(room, { kind: 'author', payload: fromPeer(peer, frame) });
        return;
      }

      const { target, payload } = readAddressed(frame);
      bus.publish(
        room,
        target.kind === 'viewers' ? { kind: 'viewers', payload } : { kind: 'peer', peer: target.peer, payload }
      );
    },
    /** A connection closed: it leaves its room, and the room learns of it. */
    async close(socket: LiveSocket) {
      const { room, role, peer } = socket.data;
      leave(socket);
      const count = await bus.count(room, role, -1);
      if (role === 'viewer') {
        bus.publish(room, { kind: 'notice', to: 'author', notice: { type: 'left', peer } });
        bus.publish(room, { kind: 'notice', to: 'all', notice: { type: 'viewers', count } });
      } else if (count === 0) {
        bus.publish(room, { kind: 'notice', to: 'viewers', notice: { type: 'author', present: false } });
      }
    }
  };

  function join(socket: LiveSocket) {
    const { room } = socket.data;
    let entry = rooms.get(room);
    if (!entry) {
      const sockets = new Set<LiveSocket>();
      entry = { sockets, unsubscribe: bus.subscribe(room, (message) => deliver(sockets, message)) };
      rooms.set(room, entry);
    }

    entry.sockets.add(socket);
  }

  function leave(socket: LiveSocket) {
    const entry = rooms.get(socket.data.room);
    entry?.sockets.delete(socket);
    if (entry && !entry.sockets.size) {
      entry.unsubscribe();
      rooms.delete(socket.data.room);
    }
  }
}

/** The relay; see {@link createRelay}. */
export type Relay = ReturnType<typeof createRelay>;

/** What the relay keeps with a connection. */
export type LiveSocketData = { room: string; role: Role; peer: string };

/** A connection as the relay uses it; Bun's `ServerWebSocket` is one. */
export type LiveSocket = {
  data: LiveSocketData;
  send(data: string | Uint8Array): unknown;
};

/**
 * What crosses between the server instances of a room: a payload for every viewer, one viewer or the author, or a
 * notice for the author, the viewers or all.
 */
export type BusMessage =
  | { kind: 'viewers'; payload: Uint8Array }
  | { kind: 'peer'; peer: string; payload: Uint8Array }
  | { kind: 'author'; payload: Uint8Array }
  | { kind: 'notice'; to: 'author' | 'viewers' | 'all'; notice: RelayNotice };

/** How the relay's server instances share rooms; see `memoryBus` and `redisBus`. */
export type LiveBus = {
  /** Delivers `message` to the room's subscribers in every instance, this one included. */
  publish(room: string, message: BusMessage): void;
  /** Listens to the room's messages; returns the function that stops listening. */
  subscribe(room: string, listener: (message: BusMessage) => void): () => void;
  /** Takes the room for the author whose key hashes to `keyHash`, or confirms it is theirs; false for another key. */
  claimAuthor(room: string, keyHash: string): Promise<boolean>;
  /** Changes the room's count of `role` connections by `delta` and returns it. */
  count(room: string, role: Role, delta: number): Promise<number>;
};

/** Delivers a bus message to the room's connections in this instance that it is for. */
function deliver(sockets: ReadonlySet<LiveSocket>, message: BusMessage) {
  for (const socket of sockets) {
    const { role, peer } = socket.data;
    if (message.kind === 'notice') {
      if (message.to === 'all' || (message.to === 'author') === (role === 'author')) {
        send(socket, message.notice);
      }
    } else if (
      (message.kind === 'viewers' && role === 'viewer') ||
      (message.kind === 'peer' && role === 'viewer' && peer === message.peer) ||
      (message.kind === 'author' && role === 'author')
    ) {
      socket.send(message.payload);
    }
  }
}

function send(socket: LiveSocket, notice: RelayNotice) {
  socket.send(JSON.stringify(notice));
}

/** The SHA-256 of `text`, in hex; only hashes of author keys are kept. */
async function digest(text: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
