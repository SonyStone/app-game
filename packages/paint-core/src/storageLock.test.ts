import { afterEach, expect, it, vi } from 'vitest';
import type { PaintStorage } from './composition/contracts';
import { lockedStorage, lockStorage } from './storageLock';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('lets one engine hold a storage, makes another wait and give up, and hands it over on release', async () => {
  vi.stubGlobal('navigator', { locks: fakeLocks() });
  const lost = vi.fn();
  const first = await lockStorage('drawing', { waitMs: 50, onLost: lost });
  expect(first?.held()).toBe(true);

  // A second engine waits, then reports the storage busy.
  expect(await lockStorage('drawing', { waitMs: 20, onLost: lost })).toBeUndefined();

  // One that waits while the first closes gets it.
  const waiting = lockStorage('drawing', { waitMs: 200, onLost: lost });
  first!.release();
  const second = await waiting;
  expect(second?.held()).toBe(true);
  expect(first!.held()).toBe(false);
  expect(lost).not.toHaveBeenCalled();
});

it('takes a storage over from its holder, which learns it lost it', async () => {
  vi.stubGlobal('navigator', { locks: fakeLocks() });
  const lost = vi.fn();
  const first = await lockStorage('drawing', { waitMs: 50, onLost: lost });
  const second = await lockStorage('drawing', { waitMs: 50, takeOver: true, onLost: () => {} });
  await Promise.resolve();
  expect(second?.held()).toBe(true);
  expect(first?.held()).toBe(false);
  expect(lost).toHaveBeenCalledOnce();
});

it('grants the lock without Web Locks, and a storage without its lock stops writing but keeps reading', async () => {
  vi.stubGlobal('navigator', {});
  expect((await lockStorage('drawing', { waitMs: 10, onLost: () => {} }))?.held()).toBe(true);

  let held = true;
  const writes: string[] = [];
  const storage = {
    save: async () => void writes.push('save'),
    flush: async () => void writes.push('flush'),
    saveView: async () => void writes.push('view'),
    collect: async () => void writes.push('collect'),
    read: async () => new Uint8Array(4)
  } as unknown as PaintStorage;
  const locked = lockedStorage(storage, () => held);
  await locked.save({} as never);
  held = false;
  await locked.save({} as never);
  await locked.flush();
  await locked.saveView({} as never);
  await locked.collect(() => []);
  expect(writes).toEqual(['save']);
  expect(await locked.read({ storageId: 'a', byteLength: 4 })).toHaveLength(4);
});

/** A LockManager of exclusive locks with `steal` and `signal`, as browsers implement them. */
function fakeLocks() {
  const holders = new Map<string, { reject: (error: Error) => void }>();
  const queues = new Map<string, (() => void)[]>();
  const grant = (name: string) => queues.get(name)?.shift()?.();
  return {
    request(
      name: string,
      options: { steal?: boolean; signal?: AbortSignal },
      callback: (lock: unknown) => Promise<unknown> | unknown
    ) {
      return new Promise((resolve, reject) => {
        const run = () => {
          const entry = { reject };
          holders.set(name, entry);
          Promise.resolve(callback({ name })).then((value) => {
            if (holders.get(name) === entry) {
              holders.delete(name);
              grant(name);
            }

            resolve(value);
          }, reject);
        };
        if (options.steal) {
          holders.get(name)?.reject(new DOMException('Stolen', 'AbortError'));
          holders.delete(name);
          run();
        } else if (!holders.has(name)) {
          run();
        } else {
          const queue = queues.get(name) ?? [];
          queues.set(name, queue);
          queue.push(run);
          options.signal?.addEventListener('abort', () => {
            queue.splice(queue.indexOf(run), 1);
            reject(new DOMException('Timed out', 'AbortError'));
          });
        }
      });
    }
  };
}
