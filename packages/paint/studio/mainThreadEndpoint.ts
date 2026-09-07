import { attempt } from './asyncResult';
import type { createPaintRuntime } from './paintRuntime';
import type { PaintEvent, PaintRuntimeCommand } from './protocol';

/** Transport surface shared with Worker; a DOM canvas is accepted only by the local endpoint. */
export type PaintEndpoint = {
  onmessage: ((event: MessageEvent<PaintEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(command: PaintRuntimeCommand): void;
  postMessage(command: PaintRuntimeCommand, transfer: Transferable[]): void;
  terminate: () => void;
};

/** Loads the same engine on demand, without creating a Worker or an OffscreenCanvas.
 * Snapshot messages like a worker boundary so mutable UI and document state never alias.
 */
export function createMainThreadEndpoint(): PaintEndpoint {
  let runtime: ReturnType<typeof createPaintRuntime> | undefined;
  let closed = false;
  const pending: PaintRuntimeCommand[] = [];
  const endpoint: PaintEndpoint = {
    onmessage: null,
    onerror: null,
    postMessage(command) {
      if (closed) return;
      const snapshot =
        command.type === 'init'
          ? { ...structuredClone({ ...command, canvas: undefined }), canvas: command.canvas }
          : structuredClone(command);
      if (runtime) runtime.send(snapshot);
      else pending.push(snapshot);
    },
    terminate() {
      closed = true;
      pending.length = 0;
      runtime?.terminate();
    }
  };
  void attempt(async () => {
    const { createPaintRuntime } = await import('./paintRuntime');
    if (closed) return;
    runtime = createPaintRuntime(
      (event) => {
        if (!closed) endpoint.onmessage?.(new MessageEvent('message', { data: structuredClone(event) }));
      },
      () => endpoint.terminate()
    );
    for (const command of pending.splice(0)) runtime.send(command);
  }).then((result) => {
    if (!result.ok && !closed) endpoint.onerror?.(new ErrorEvent('error', { message: result.error.message }));
  });
  return endpoint;
}
