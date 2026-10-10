import type { PaintCommand } from '@app-game/paint-core/protocol';
import type { Accessor } from 'solid-js';

/**
 * Keeps the GPU clock up while a pen hovers over the canvas, so the first frames of the coming stroke are not slowed
 * by a GPU that lowered its clock while idle. Asks the engine to warm up (`warm`) at most every `reportMs` of hover.
 */
export function createGpuWarmup(options: {
  enabled: Accessor<boolean>;
  send: (command: Extract<PaintCommand, { type: 'warm' }>) => void;
}) {
  let reportedAt = -Infinity;
  return {
    /** Pass to the canvas input's `hover`. */
    hover(event: PointerEvent) {
      if (!options.enabled() || event.timeStamp - reportedAt < reportMs) {
        return;
      }

      reportedAt = event.timeStamp;
      options.send({ type: 'warm' });
    }
  };
}

/** Shortest time between two warm-up requests, in milliseconds; well below the engine's warm window. */
const reportMs = 100;
