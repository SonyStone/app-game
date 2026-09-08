import { createMainThreadEndpoint, type PaintEndpoint } from './mainThreadEndpoint';
import Worker from './paint.worker?worker';
import type { PaintEvent, PaintRuntimeCommand } from './protocol';

/** Uses the production transports with correlated ordered replies and bounded waits. */
export async function openVerificationEndpoint(main: boolean, storageName: string) {
  const endpoint: PaintEndpoint = main ? createMainThreadEndpoint() : new Worker();
  const listeners = new Set<(event: PaintEvent) => void>();
  let closed = false;
  endpoint.onmessage = ({ data }) => listeners.forEach((receive) => receive(data));
  endpoint.onerror = ({ message }) =>
    listeners.forEach((receive) => receive({ type: 'error', message, recoverable: false }));
  const wait = <T extends PaintEvent['type']>(type: T, accept?: (event: Extract<PaintEvent, { type: T }>) => boolean) =>
    new Promise<Extract<PaintEvent, { type: T }>>((resolve, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(receive);
        reject(new Error(`Paint verification timed out waiting for ${type}.`));
      }, 30_000);
      const receive = (event: PaintEvent) => {
        if (event.type !== 'error' && event.type !== type) return;
        if (event.type !== 'error' && accept && !accept(event as Extract<PaintEvent, { type: T }>)) return;
        clearTimeout(timer);
        listeners.delete(receive);
        if (event.type === 'error') reject(new Error(event.message));
        else resolve(event as Extract<PaintEvent, { type: T }>);
      };
      listeners.add(receive);
    });
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
