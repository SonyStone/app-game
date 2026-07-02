import { createRAF } from '@solid-primitives/raf';

export interface RafQueue {
  readonly schedule: () => void;
  readonly cancel: () => void;
}

export function createRafQueue(flush: () => void): RafQueue {
  let queued = false;
  const [, start, stop] = createRAF(() => {
    stop();

    if (!queued) {
      return;
    }

    queued = false;
    flush();
  });

  return {
    schedule: () => {
      if (queued) {
        return;
      }

      queued = true;
      start();
    },
    cancel: () => {
      queued = false;
      stop();
    }
  };
}
