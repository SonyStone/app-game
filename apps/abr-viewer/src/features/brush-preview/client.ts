import type { BrushTipImage } from '../../lib/abr';
import { generatePreviewTip } from './physical-tip';
import type { PreviewJob, PreviewReply } from './protocol';
import { createPreviewQueue } from './queue';
import { decodePreviewResources, type PreviewResourceSource } from './resources';
import { type PreviewInput } from './stroke';

/** Registers a presentation canvas with the shared worker. Disposing cancels pending work for that canvas. */
export function attachPreview(canvas: HTMLCanvasElement) {
  service ??= createPreviewService();
  return service.attach(canvas);
}

/** Immutable tip arrays share cache keys across brush edits and duplicated presets. */
export function previewTipKey(tip: BrushTipImage | undefined, hardness: number) {
  if (!tip) return `computed:${hardness}`;
  let id = tipIds.get(tip.data);
  if (!id) {
    id = `sampled:${++tipCounter}`;
    tipIds.set(tip.data, id);
  }
  return id;
}

function createPreviewService() {
  type Request = PreviewJob & {
    target: number;
    priority: number;
    sourceTip?: BrushTipImage;
    resourceSource?: PreviewResourceSource;
  };
  const queue = createPreviewQueue<Request>();
  const targets = new Map<number, { canvas: HTMLCanvasElement; revision: number; signature: string }>();
  let worker: Worker | undefined, active: Request | undefined;
  let fallback = false,
    reason = '';
  let nextTarget = 0,
    nextJob = 0;
  let timer: ReturnType<typeof setTimeout> | undefined, timeout: ReturnType<typeof setTimeout> | undefined;
  let shutdown: ReturnType<typeof setTimeout> | undefined;

  function schedule() {
    if (!active && timer === undefined)
      timer = setTimeout(() => {
        timer = undefined;
        pump();
      }, 0);
  }
  function pump() {
    if (active) return;
    active = queue.take();
    if (!active) return;
    if (fallback) {
      void renderFallback(active);
      return;
    }
    try {
      if (!worker) {
        worker = new Worker(new URL('./preview.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<PreviewReply>) => receive(event.data);
        worker.onerror = (event) => failWorker(event.message);
        worker.onmessageerror = () => failWorker('Preview worker message failed');
      }
      timeout = setTimeout(() => failWorker('Preview worker timed out'), 15000);
      worker.postMessage({
        id: active.id,
        tipKey: active.tipKey,
        input: active.input,
        auxKey: active.auxKey
      } satisfies PreviewJob);
    } catch (error) {
      failWorker(String(error));
    }
  }
  function receive(reply: PreviewReply) {
    if (!active || reply.id !== active.id) {
      if (reply.type === 'image') reply.bitmap.close();
      return;
    }
    if (reply.type === 'need-tip') {
      const target = targets.get(active.target);
      if (!target || target.revision !== active.id) {
        finish();
        return;
      }
      if (!active.sourceTip && !active.tipKey.startsWith('computed:') && !active.tipKey.startsWith('physical:')) {
        failWorker('Brush tip unavailable');
        return;
      }
      const tip = active.sourceTip ?? generatePreviewTip(active.input.values);
      // Copy only the coverage bytes. Transferring the original would detach data needed by ABR export.
      const data = new Uint8Array(tip.data);
      const source = active.resourceSource;
      const pattern = source?.pattern;
      const sample = source?.dualSample;
      const resources: PreviewResourceSource = {
        pattern: pattern
          ? {
              id: pattern.id,
              name: pattern.name,
              mode: pattern.mode,
              width: pattern.width,
              height: pattern.height,
              data: new Uint8Array(pattern.data)
            }
          : undefined,
        dualSample: sample ? { subVersion: sample.subVersion, data: new Uint8Array(sample.data) } : undefined,
        dualHardness: source?.dualHardness,
        missing: source?.missing
      };
      const transfers: ArrayBuffer[] = [data.buffer];
      if (resources.pattern) transfers.push(resources.pattern.data.buffer as ArrayBuffer);
      if (resources.dualSample) transfers.push(resources.dualSample.data.buffer as ArrayBuffer);
      worker!.postMessage(
        {
          id: active.id,
          input: active.input,
          tipKey: active.tipKey,
          auxKey: active.auxKey,
          resources,
          tip: { width: tip.width, height: tip.height, depth: tip.depth, data }
        } satisfies PreviewJob,
        transfers
      );
      return;
    }
    if (reply.type === 'error') {
      failWorker(reply.message);
      return;
    }
    const target = targets.get(active.target);
    if (target?.revision === active.id) {
      const canvas = target.canvas;
      canvas.width = active.input.width;
      canvas.height = active.input.height;
      const context = canvas.getContext('bitmaprenderer');
      if (context) context.transferFromImageBitmap(reply.bitmap);
      else {
        canvas.getContext('2d')?.drawImage(reply.bitmap, 0, 0);
        reply.bitmap.close();
      }
      canvas.dataset.previewBackend = reply.backend;
      canvas.dataset.previewState = 'ready';
      canvas.dataset.previewReason = reply.reason ?? '';
    } else reply.bitmap.close();
    finish();
  }
  function finish() {
    clearTimeout(timeout);
    active = undefined;
    schedule();
  }
  function failWorker(message: string) {
    if (fallback) return;
    reason = message;
    fallback = true;
    worker?.terminate();
    worker = undefined;
    clearTimeout(timeout);
    if (active) void renderFallback(active);
  }
  async function renderFallback(job: Request) {
    try {
      const { renderPreviewPixels } = await import('./cpu');
      const target = targets.get(job.target);
      if (target?.revision !== job.id) return;
      const tip = job.sourceTip ?? generatePreviewTip(job.input.values);
      const pixels = new ImageData(
        renderPreviewPixels(job.input, tip, undefined, decodePreviewResources(job.resourceSource ?? {})),
        job.input.width,
        job.input.height
      );
      const bitmap = await createImageBitmap(pixels);
      receive({ type: 'image', id: job.id, bitmap, backend: 'cpu', reason });
    } catch (error) {
      const target = targets.get(job.target);
      if (target?.revision === job.id) {
        target.canvas.dataset.previewState = 'error';
        target.canvas.dataset.previewReason = String(error);
      }
    } finally {
      if (active?.id === job.id) finish();
    }
  }
  function dispose() {
    worker?.terminate();
    clearTimeout(timeout);
    clearTimeout(timer);
    clearTimeout(shutdown);
    queue.clear();
    targets.clear();
    active = undefined;
  }
  return {
    dispose,
    attach(canvas: HTMLCanvasElement) {
      clearTimeout(shutdown);
      const id = ++nextTarget;
      const state = { canvas, revision: 0, signature: '' };
      targets.set(id, state);
      return {
        /** Replace queued settings; at most one render can be in flight across the entire workspace. */
        update(
          input: PreviewInput,
          tip: BrushTipImage | undefined,
          priority: number,
          resources: PreviewResourceSource = {}
        ) {
          const auxKey = [
            resources.pattern ? resourceId(resources.pattern.data) : '',
            resources.dualSample ? resourceId(resources.dualSample.data) : '',
            resources.dualHardness ?? '',
            resources.missing ?? ''
          ].join(':');
          const tipKey =
            !tip && ['dBrush', 'dTips'].includes(input.values.tipKind)
              ? `physical:${JSON.stringify([input.values.tipKind, input.values.tipVariant, input.values.bristle, input.values.erodible])}`
              : previewTipKey(tip, input.values.hardness);
          const signature = JSON.stringify([tipKey, auxKey, { ...input, values: { ...input.values, name: '' } }]);
          if (signature === state.signature) return;
          state.signature = signature;
          state.revision = ++nextJob;
          canvas.dataset.previewState = 'pending';
          canvas.dataset.previewRevision = String(state.revision);
          queue.put({
            id: state.revision,
            target: id,
            priority,
            input,
            tipKey,
            auxKey,
            sourceTip: tip,
            resourceSource: resources
          });
          schedule();
        },
        /** Keep the last image while offscreen, but invalidate late responses. */
        pause() {
          queue.remove(id);
          state.revision = ++nextJob;
          state.signature = '';
        },
        dispose() {
          targets.delete(id);
          queue.remove(id);
          if (!targets.size)
            shutdown = setTimeout(() => {
              dispose();
              service = undefined;
            }, 1000);
        }
      };
    }
  };
}

let service: ReturnType<typeof createPreviewService> | undefined;
const tipIds = new WeakMap<Uint8Array, string>();
let tipCounter = 0;

if (import.meta.hot)
  import.meta.hot.dispose(() => {
    service?.dispose();
    service = undefined;
  });

function resourceId(data: Uint8Array) {
  let id = tipIds.get(data);
  if (!id) {
    id = `resource:${++tipCounter}`;
    tipIds.set(data, id);
  }
  return id;
}
