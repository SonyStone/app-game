import { createSignal, onCleanup } from 'solid-js';
import { attempt, type Result } from '../asyncResult';
import type { Brush } from '../brush';
import type { PaintEndpoint } from '../mainThreadEndpoint';
import type { PaintEvent } from '../protocol';

/** Correlates idle engine actions on the existing ordered transport, including local execution.
 * Disconnect settles pending work explicitly. A replacement endpoint never receives an old action.
 */
export function createBrushCommands(canRun: () => boolean) {
  const [busy, setBusy] = createSignal(false, { ownedWrite: true });
  let endpoint: PaintEndpoint | undefined;
  let pending: { id: string; resolve: (result: Result<void, string>) => void } | undefined;
  let disposed = false;
  onCleanup(() => {
    disposed = true;
    connect(undefined);
  });
  return {
    busy,
    isBusy: () => pending !== undefined,
    connect,
    receive(event: PaintEvent) {
      if (event.type === 'brush-command' && pending?.id === event.requestId) finish(event.result);
    },
    /** Returns an explicit outcome. Concurrent actions and painting are rejected, never silently dropped. */
    async run(brush: Brush, command: unknown): Promise<Result<void, string>> {
      if (!endpoint || pending || !canRun())
        return { ok: false, error: 'Wait for the current drawing operation to finish.' };
      const target = endpoint;
      const id = crypto.randomUUID();
      let resolve!: (result: Result<void, string>) => void;
      const result = new Promise<Result<void, string>>((settle) => {
        resolve = settle;
      });
      pending = { id, resolve };
      setBusy(true);
      const sent = await attempt(() => target.postMessage({ type: 'brush-command', requestId: id, brush, command }));
      if (!sent.ok && pending?.id === id) finish({ ok: false, error: sent.error.message });
      return result;
    }
  };

  function connect(value: PaintEndpoint | undefined) {
    finish({ ok: false, error: 'The drawing engine changed before the brush command completed.' });
    endpoint = disposed ? undefined : value;
  }
  function finish(result: Result<void, string>) {
    const request = pending;
    pending = undefined;
    if (!request) return;
    setBusy(false);
    request.resolve(result);
  }
}
