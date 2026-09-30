import type { PaintCommand } from '@app-game/paint-core/protocol';
import { isWorkerShutdown, type workerShutdown } from '@app-game/solid-gpu/worker/workerProtocol';
import { createStudioRuntime } from './StudioApplication';

/**
 * Worker entry: runs the Studio recipe and exchanges `PaintCommand`/`PaintEvent` messages with the editor. Only a
 * transferred OffscreenCanvas crosses this boundary. After a `dispose` command has saved the document, the runtime
 * closes the worker itself. The transport's `workerShutdown`, sent by `close()`, releases the runtime's GPU and storage
 * resources; the transport terminates the worker after its grace period.
 */
const runtime = createStudioRuntime(
  (event) => self.postMessage(event),
  () => self.close()
);

self.onmessage = ({ data }: MessageEvent<PaintCommand | typeof workerShutdown>) => {
  if (isWorkerShutdown(data)) {
    runtime.terminate();
    return;
  }

  runtime.send(data);
};
