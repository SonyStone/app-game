import type { Role } from './envelope';
import type { BusMessage, LiveBus } from './relay';

/**
 * A bus for one server process, which holds every connection: running locally, for example next to the dev server.
 * Rooms are claimed for as long as the process runs.
 */
export function memoryBus(): LiveBus {
  const listeners = new Map<string, Set<(message: BusMessage) => void>>();
  const keys = new Map<string, string>();
  const counts = new Map<string, number>();

  return {
    publish(room, message) {
      for (const listener of listeners.get(room) ?? []) {
        listener(message);
      }
    },
    subscribe(room, listener) {
      const set = listeners.get(room) ?? new Set();
      listeners.set(room, set);
      set.add(listener);
      return () => {
        set.delete(listener);
        if (!set.size) {
          listeners.delete(room);
        }
      };
    },
    async claimAuthor(room, keyHash) {
      const owner = keys.get(room);
      if (owner === undefined) {
        keys.set(room, keyHash);
        return true;
      }

      return owner === keyHash;
    },
    async count(room, role, delta) {
      const key = `${room}/${role}`;
      const next = Math.max(0, (counts.get(key) ?? 0) + delta);
      counts.set(key, next);
      return next;
    }
  };
}

/**
 * A bus over Redis for server instances that do not share memory, as Vercel Functions do: messages go through Redis
 * pub/sub on the channel `live:<room>`, payloads in base64, since Bun's client publishes text. A room stays claimed for
 * a day after its author last connected, and connection counts expire after a day as well.
 *
 * `commands` sends commands; `subscriber` only listens, as Redis requires of a connection with subscriptions.
 */
export function redisBus(redis: { commands: RedisCommands; subscriber: RedisSubscriber }): LiveBus {
  const listeners = new Map<string, Set<(message: BusMessage) => void>>();
  const channel = (room: string) => `live:${room}`;

  return {
    publish(room, message) {
      void redis.commands.publish(channel(room), encodeBusMessage(message));
    },
    subscribe(room, listener) {
      let set = listeners.get(room);
      if (!set) {
        set = new Set();
        listeners.set(room, set);
        const subscribed = set;
        void redis.subscriber.subscribe(channel(room), (text) => {
          const message = decodeBusMessage(text);
          for (const each of subscribed) {
            each(message);
          }
        });
      }

      set.add(listener);
      return () => {
        set.delete(listener);
        if (!set.size) {
          listeners.delete(room);
          void redis.subscriber.unsubscribe(channel(room));
        }
      };
    },
    async claimAuthor(room, keyHash) {
      const key = `live:${room}:author`;
      await redis.commands.send('SET', [key, keyHash, 'NX', 'EX', String(dayInSeconds)]);
      const owner = await redis.commands.send('GET', [key]);
      if (owner !== keyHash) {
        return false;
      }

      await redis.commands.send('EXPIRE', [key, String(dayInSeconds)]);
      return true;
    },
    async count(room, role: Role, delta) {
      const key = `live:${room}:${role}s`;
      const value = Number(await redis.commands.send('INCRBY', [key, String(delta)]));
      await redis.commands.send('EXPIRE', [key, String(dayInSeconds)]);
      return Math.max(0, value);
    }
  };
}

/** The commands `redisBus` sends, as Bun's `RedisClient` offers them. */
export type RedisCommands = {
  publish(channel: string, message: string): Promise<unknown>;
  send(command: string, args: string[]): Promise<unknown>;
};

/** A connection that only listens, as Bun's `RedisClient` offers it once subscribed. */
export type RedisSubscriber = {
  subscribe(channel: string, listener: (message: string, channel: string) => void): Promise<unknown>;
  unsubscribe(channel: string): Promise<unknown>;
};

/** A bus message as text, with its payload in base64. */
export function encodeBusMessage(message: BusMessage): string {
  return JSON.stringify(
    'payload' in message ? { ...message, payload: Buffer.from(message.payload).toString('base64') } : message
  );
}

/** The bus message of `encodeBusMessage`'s text. */
export function decodeBusMessage(text: string): BusMessage {
  const value = JSON.parse(text) as BusMessage | (Omit<BusMessage, 'payload'> & { payload: string });
  return 'payload' in value && typeof value.payload === 'string'
    ? ({ ...value, payload: new Uint8Array(Buffer.from(value.payload, 'base64')) } as BusMessage)
    : (value as BusMessage);
}

const dayInSeconds = 24 * 60 * 60;
