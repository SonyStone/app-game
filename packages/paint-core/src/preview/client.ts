import type { PreviewPoint } from '@app-game/abr-brush/stroke';
import type { PreviewConfiguration, PreviewJob, PreviewReply } from './protocol';
import { createPreviewQueue } from './queue';
import { readThumbnail, storeThumbnail, thumbnailKey } from './thumbnailCache';

/** Attaches a bitmap presentation target to the page's single preview worker/device. Dispose when unmounted. */
export function attachStrokePreview(canvas: HTMLCanvasElement) {
  service ??= createStrokePreviewService();
  return service.attach(canvas);
}

/** Owns scheduling and stale-result disposal. Injection allows transport/lifetime tests without a GPU. */
export function createStrokePreviewService(
  createWorker = () => new Worker(new URL('./preview.worker.ts', import.meta.url), { type: 'module' })
) {
  type Request = PreviewJob & { priority: number; cacheKey?: string; started?: number };
  type Target = {
    canvas: HTMLCanvasElement;
    revision: number;
    signature: string;
    configuration?: PreviewConfiguration;
    pending?: Request;
    contact: boolean;
    idle: boolean;
    lastTick: number;
  };
  const queue = createPreviewQueue<Request>();
  const targets = new Map<number, Target>();
  let worker: Worker | undefined;
  let active: Request | undefined;
  let held: number | undefined;
  let frame: number | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let shutdown: ReturnType<typeof setTimeout> | undefined;
  let nextTarget = 0;
  let nextJob = 0;
  let failure: string | undefined;
  let disposed = false;

  function schedule() {
    if (frame === undefined && !disposed) {
      frame = requestAnimationFrame(pump);
    }
  }

  function put(target: number, state: Target, action: Request['action'], points: readonly PreviewPoint[] = []) {
    const request: Request = {
      id: ++nextJob,
      target,
      revision: state.revision,
      action,
      priority: state.configuration?.priority ?? 0,
      configuration: action === 'sample' || action === 'begin' ? state.configuration : undefined,
      points: points.map((point) => ({ ...point }))
    };
    state.pending = request;
    queue.put(request);
    state.canvas.dataset.previewState = 'pending';
    schedule();
  }

  function pump(now: number) {
    frame = undefined;
    if (active || disposed) {
      return;
    }
    const contact = held === undefined ? undefined : targets.get(held);
    if (contact && !contact.pending && contact.idle) {
      put(held!, contact, 'add');
    }
    if (contact?.pending) {
      active = contact.pending;
      queue.remove(held!);
    } else if (contact) {
      return;
    } else {
      active = queue.take();
    }
    if (!active) {
      return;
    }
    const target = targets.get(active.target);
    if (target?.pending === active) {
      target.pending = undefined;
    }
    active.elapsedMs = target ? Math.max(0, now - target.lastTick) : 0;
    if (target) {
      target.lastTick = now;
    }
    active.started = performance.now();
    void render(active);
  }

  async function render(job: Request) {
    if (job.action === 'sample' && job.configuration?.thumbnail) {
      try {
        job.cacheKey = await thumbnailKey(job.configuration);
        const blob = await readThumbnail(job.cacheKey);
        if (active !== job) {
          return;
        }
        if (!valid(job)) {
          complete();
          return;
        }
        if (blob) {
          const bitmap = await createImageBitmap(blob);
          receive({ type: 'image', id: job.id, bitmap, renderMs: 0 });
          return;
        }
      } catch (error) {
        console.warn('Could not restore brush thumbnail:', error);
      }
    }
    if (failure) {
      receive({ type: 'error', id: job.id, message: failure });
      return;
    }
    try {
      worker ??= createWorker();
      worker.onmessage = (event: MessageEvent<PreviewReply>) => receive(event.data);
      worker.onerror = (event) => fail(event.message);
      worker.onmessageerror = () => fail('Preview worker message failed.');
      timeout = setTimeout(() => fail('Preview worker timed out.'), 30000);
      // Structured cloning preserves source buffers. Never transfer preset/export resource ownership.
      worker.postMessage(job);
    } catch (error) {
      fail(String(error));
    }
  }

  function valid(job: Request) {
    return targets.get(job.target)?.revision === job.revision;
  }

  function receive(reply: PreviewReply) {
    const job = active;
    if (!job || reply.id !== job.id) {
      if (reply.type === 'image') {
        reply.bitmap.close();
      }
      return;
    }
    const target = targets.get(job.target);
    if (reply.type === 'image') {
      if (target && valid(job)) {
        if (job.cacheKey) {
          storeThumbnail(job.cacheKey, reply.bitmap);
        }
        target.canvas.width = reply.bitmap.width;
        target.canvas.height = reply.bitmap.height;
        const context = target.canvas.getContext('bitmaprenderer');
        if (context) {
          context.transferFromImageBitmap(reply.bitmap);
        } else {
          target.canvas.getContext('2d')?.drawImage(reply.bitmap, 0, 0);
          reply.bitmap.close();
        }
        target.canvas.dataset.previewBackend = 'gpu';
        target.canvas.dataset.previewRevision = String(job.id);
        target.canvas.dataset.previewState = target.pending ? 'pending' : 'ready';
        target.canvas.dataset.previewReason = reply.reason ?? '';
        target.canvas.dataset.previewRenderMs = String(reply.renderMs);
        target.canvas.dataset.previewLatencyMs = String(performance.now() - job.started!);
        target.idle = reply.idle === true && target.contact;
      } else {
        reply.bitmap.close();
      }
    } else if (reply.type === 'done' && target && valid(job)) {
      target.idle = false;
      target.canvas.dataset.previewState = target.pending ? 'pending' : 'ready';
    } else if (reply.type === 'error' && target && valid(job)) {
      target.canvas.dataset.previewState = 'error';
      target.canvas.dataset.previewReason = reply.message;
      target.idle = false;
      target.contact = false;
      if (held === job.target) {
        held = undefined;
      }
    }
    if ((job.action === 'finish' || job.action === 'cancel' || job.end) && held === job.target && !target?.contact) {
      held = undefined;
    }
    complete();
  }

  function complete() {
    clearTimeout(timeout);
    active = undefined;
    schedule();
  }

  function fail(message: string) {
    failure = message;
    worker?.terminate();
    worker = undefined;
    if (active) {
      receive({ type: 'error', id: active.id, message });
    }
  }

  function dispose() {
    disposed = true;
    worker?.terminate();
    clearTimeout(timeout);
    clearTimeout(shutdown);
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
    }
    queue.clear();
    targets.clear();
    active = undefined;
  }

  const api = {
    dispose,
    attach(canvas: HTMLCanvasElement) {
      clearTimeout(shutdown);
      const id = ++nextTarget;
      const state: Target = { canvas, revision: 0, signature: '', contact: false, idle: false, lastTick: 0 };
      targets.set(id, state);
      const cancel = () => {
        state.contact = false;
        state.idle = false;
        state.revision++;
        state.signature = '';
        queue.remove(id);
        state.pending = undefined;
        if (held === id) {
          held = undefined;
          // Controls follow any in-flight packet in the worker's serial mailbox, even on a cache hit.
          worker?.postMessage({
            id: ++nextJob,
            target: id,
            revision: state.revision,
            action: 'cancel',
            points: []
          } satisfies PreviewJob);
        }
      };
      return {
        /** Replaces sample settings. Resource identities avoid serializing byte arrays on the UI thread. */
        update(configuration: PreviewConfiguration) {
          const sourceBuffers = new Map<number, Uint8Array>();
          const signature = JSON.stringify(configuration, (_key, value) => {
            if (value instanceof Uint8Array) {
              const id = bufferId(value);
              sourceBuffers.set(id, value);
              return { previewBuffer: id };
            }
            return value;
          });
          if (signature === state.signature) {
            return;
          }
          cancel();
          state.signature = signature;
          // Detach reactive metadata once per settings revision; immutable resource bytes stay borrowed.
          state.configuration = JSON.parse(signature, (_key, value) =>
            value && typeof value === 'object' && 'previewBuffer' in value
              ? sourceBuffers.get(value.previewBuffer)
              : value
          );
          put(id, state, 'sample');
        },
        /** Starts a fresh tiny document with captured settings. Coordinates are normalized to the target. */
        begin(points: readonly PreviewPoint[]) {
          if (!state.configuration) {
            return;
          }
          state.revision++;
          state.contact = true;
          state.idle = true;
          state.lastTick = performance.now();
          held = id;
          put(id, state, 'begin', points);
        },
        /** Appends only new input. Pending packets merge without dropping points or revisiting previous input. */
        add(points: readonly PreviewPoint[]) {
          if (!state.contact) {
            return;
          }
          state.idle = true;
          if (state.pending) {
            for (const point of points) {
              state.pending.points.push({ ...point });
            }
          } else {
            put(id, state, 'add', points);
          }
        },
        /** Flushes the real engine endpoint and commits once. Thumbnails resume after the final presentation. */
        finish() {
          if (!state.contact) {
            return;
          }
          state.contact = false;
          state.idle = false;
          const pending = state.pending;
          if (pending?.action === 'begin') {
            pending.end = true;
          } else if (pending) {
            pending.action = 'finish';
          } else {
            put(id, state, 'finish');
          }
        },
        /** Invalidates late images and releases a hidden gesture, retaining its last presented image. */
        pause: cancel,
        dispose() {
          cancel();
          targets.delete(id);
          if (!targets.size) {
            shutdown = setTimeout(() => {
              dispose();
              if (service === api) {
                service = undefined;
              }
            }, 1000);
          }
        }
      };
    }
  };
  return api;
}

let service: ReturnType<typeof createStrokePreviewService> | undefined;
const buffers = new WeakMap<Uint8Array, number>();
let nextBuffer = 0;
function bufferId(bytes: Uint8Array) {
  let id = buffers.get(bytes);
  if (id === undefined) {
    id = ++nextBuffer;
    buffers.set(bytes, id);
  }
  return id;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    service?.dispose();
    service = undefined;
  });
}
