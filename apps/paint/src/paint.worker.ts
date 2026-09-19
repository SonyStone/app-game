import { createStudioRuntime } from './composition/StudioApplication';
import type { PaintCommand } from '@app-game/paint-core/protocol';

// Vite's worker entry owns only the transport; both modes execute the same drawing engine.
const runtime = createStudioRuntime(
  (event) => self.postMessage(event),
  () => self.close()
);
self.onmessage = (event: MessageEvent<PaintCommand>) => runtime.send(event.data);
