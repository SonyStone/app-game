import { createMainThreadEndpoint, type PaintEndpoint } from './mainThreadEndpoint';
import Worker from '../../src/features/engine/paint.worker?worker';
import type { PaintEvent, PaintRuntimeCommand } from '@app-game/paint-core/protocol';
import { createPaintEvents } from './paintEvents';

/** Uses the production transports with correlated ordered replies and bounded waits. */
export async function openVerificationEndpoint(main: boolean, storageName: string) {
  const endpoint: PaintEndpoint = main ? createMainThreadEndpoint() : new Worker();
  const events = createPaintEvents();
  const { wait } = events;
  let closed = false;
  events.attach(endpoint);
  const command = <T extends PaintEvent['type']>(message: PaintRuntimeCommand, type: T) => {
    const result = wait(type);
    endpoint.postMessage(message);
    return result;
  };
  try {
    const ready = wait('ready');
    const size = { width: 256, height: 256 };
    if (main)
      endpoint.postMessage({ type: 'init', canvas: document.createElement('canvas'), size, dpr: 1, storageName });
    else {
      const canvas = new OffscreenCanvas(256, 256);
      endpoint.postMessage({ type: 'init', canvas, size, dpr: 1, storageName }, [canvas]);
    }
    await ready;
  } catch (error) {
    endpoint.terminate();
    throw error;
  }
  return {
    wait,
    command,
    post: (command: PaintRuntimeCommand) => endpoint.postMessage(command),
    async close() {
      if (closed) return;
      closed = true;
      try {
        await command({ type: 'dispose' }, 'disposed');
      } finally {
        endpoint.terminate();
      }
    }
  };
}
