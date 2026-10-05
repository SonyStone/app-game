import type { PaintStorage } from './composition/contracts';

/**
 * Takes the exclusive lock of the storage `name` for this engine, across the browser's tabs and workers (Web Locks),
 * so that only one engine at a time writes a drawing: two engines on one storage each save over the other's drawing and
 * collect the tiles only the other refers to. Waits up to `waitMs` for an engine that is closing, as one replaced by a
 * reload does; `takeOver` takes the lock from its holder at once instead, which then gets `onLost`. Resolves
 * `undefined` when another engine keeps it. Without Web Locks, as in tests, the lock is always granted.
 */
export function lockStorage(
  name: string,
  options: { waitMs: number; takeOver?: boolean; onLost: () => void }
): Promise<StorageLock | undefined> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (!locks) {
    return Promise.resolve({ held: () => true, release() {} });
  }

  return new Promise((resolve) => {
    let state: 'waiting' | 'held' | 'released' | 'lost' = 'waiting';
    let release!: () => void;
    const holding = new Promise<void>((done) => (release = done));
    const lock: StorageLock = {
      held: () => state === 'held',
      release() {
        if (state === 'held' || state === 'waiting') {
          state = 'released';
        }

        release();
      }
    };
    locks
      .request(
        `paint-storage:${name}`,
        options.takeOver ? { steal: true } : { signal: AbortSignal.timeout(options.waitMs) },
        () => {
          if (state === 'released') {
            return undefined;
          }

          state = 'held';
          resolve(lock);
          return holding;
        }
      )
      .catch(() => {
        if (state === 'waiting') {
          // The wait ran out: another engine keeps the drawing.
          state = 'released';
          resolve(undefined);
        } else if (state === 'held') {
          // Another engine took the lock.
          state = 'lost';
          options.onLost();
        }
      });
  });
}

/** The lock of a storage; see {@link lockStorage}. */
export type StorageLock = {
  /** Whether this engine still holds it; false once released or taken by another engine. */
  held: () => boolean;
  release: () => void;
};

/**
 * `storage` that writes only while `held` says so: checkpoints, staged tiles, the view record and collection do
 * nothing once another engine took the drawing, so this one cannot save over it or delete its tiles. Reads go on.
 */
export function lockedStorage(storage: PaintStorage, held: () => boolean): PaintStorage {
  const whileHeld =
    <Args extends unknown[]>(write: (...args: Args) => Promise<void>) =>
    (...args: Args) =>
      held() ? write(...args) : Promise.resolve();
  return {
    ...storage,
    save: whileHeld(storage.save),
    flush: whileHeld(storage.flush),
    saveView: whileHeld(storage.saveView),
    collect: whileHeld(storage.collect)
  };
}
