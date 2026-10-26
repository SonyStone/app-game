import type { PreviewJob } from './protocol';
import { createPreviewRuntime } from './runtime';

const runtime = createPreviewRuntime();
let pending = Promise.resolve();
self.onmessage = (event: MessageEvent<PreviewJob>) => {
  pending = pending.then(async () => {
    const reply = await runtime.run(event.data);
    self.postMessage(reply, { transfer: reply.type === 'image' ? [reply.bitmap] : [] });
  });
};
