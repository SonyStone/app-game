import type { PaintEvent } from '@app-game/paint-core/protocol';
import { within } from '../waits';
import type { PaintEndpoint } from './mainThreadEndpoint';

/**
 * Event waits for a worker or main-thread paint endpoint, shared by every browser harness. `attach` routes an endpoint's
 * events here and can be called again after the harness replaces its endpoint (mode switch, restart). A wait resolves
 * with the next matching event posted after it was created; an `error` event or a failed worker rejects it, and so does
 * a wait longer than `waitLimitMs`.
 */
export function createPaintEvents() {
  const listeners = new Set<(event: PaintEvent) => void>();
  const deliver = (event: PaintEvent) => [...listeners].forEach((receive) => receive(event));

  /** Next event satisfying `matches`. */
  const waitFor = (matches: (event: PaintEvent) => boolean, description = 'a matching event') => {
    let receive!: (event: PaintEvent) => void;
    const event = new Promise<PaintEvent>((resolve, reject) => {
      receive = (event) => {
        if (event.type === 'error') {
          reject(new Error(event.message));
        } else if (matches(event)) {
          resolve(event);
        }
      };
    });
    listeners.add(receive);
    return within(event, `Paint verification timed out waiting for ${description}`).finally(() =>
      listeners.delete(receive)
    );
  };

  return {
    attach(endpoint: Pick<PaintEndpoint, 'onmessage' | 'onerror'>) {
      endpoint.onmessage = ({ data }) => deliver(data);
      endpoint.onerror = (event) =>
        deliver({ type: 'error', message: event.message || 'Paint endpoint stopped.', recoverable: false });
    },
    waitFor,
    /** Next event of `type` that `accept` (if given) approves. */
    wait<T extends PaintEvent['type']>(type: T, accept?: (event: Extract<PaintEvent, { type: T }>) => boolean) {
      return waitFor(
        (event) => event.type === type && (!accept || accept(event as Extract<PaintEvent, { type: T }>)),
        type
      ) as Promise<Extract<PaintEvent, { type: T }>>;
    }
  };
}
