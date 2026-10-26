import { brushToFormValues } from '@app-game/abr-brush/form';
import { generateComputedBrushTip, type PreviewPoint } from '@app-game/abr-brush/stroke';
import { percent, pixels } from '@app-game/abr-parser';
import { createPaintRenderer } from '../src/gpu/renderer';
import { attachStrokePreview } from '../src/preview/client';
import type { PreviewConfiguration } from '../src/preview/protocol';
import { createPreviewRuntime } from '../src/preview/runtime';

/** Reproducible 2,000-point benchmark. Times stop at canvas transfer/submission, not physical display scan-out. */
export async function measureStrokePreviews(
  configurations?: readonly { name: string; configuration: PreviewConfiguration }[]
) {
  const results = [];
  const points: PreviewPoint[] = Array.from({ length: 2000 }, (_, i) => ({
    x: 0.1 + (0.8 * i) / 1999,
    y: 0.5 + 0.25 * Math.sin((i / 1999) * Math.PI * 12),
    pressure: 0.2 + 0.8 * Math.sin((i / 1999) * Math.PI),
    tiltX: 15,
    tiltY: 25,
    rotation: i * 0.18,
    time: i
  }));
  for (const kind of configurations?.map((entry) => entry.name) ?? ['round', 'sampled', 'mixer']) {
    const values = brushToFormValues({
      name: kind,
      preset: {
        kind: 'brush',
        sourceId: 'benchmark',
        tip: { kind: 'computed', diameter: pixels(32), spacing: percent(10), hardness: percent(85) }
      }
    });
    values.useSmoothing = false;
    if (kind === 'sampled') {
      values.tipKind = 'sampledBrush';
    }
    if (kind === 'mixer') {
      values.tool.type = 'MixB';
    }
    const configuration: PreviewConfiguration = configurations?.find((entry) => entry.name === kind)?.configuration ?? {
      kind: 'abr',
      width: 640,
      height: 200,
      dpr: 1,
      background: '#333333',
      tip: kind === 'sampled' ? generateComputedBrushTip(128, 65) : undefined,
      input: { values, width: 640, height: 200, dpr: 1, background: '#333333', color: '#ffffff', flow: 0.5, opacity: 1 }
    };
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    const connection = attachStrokePreview(canvas);
    const wait = () =>
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          observer.disconnect();
          reject(new Error(canvas.dataset.previewReason || 'Preview timeout'));
        }, 30000);
        const observer = new MutationObserver(() => {
          if (canvas.dataset.previewState === 'ready' || canvas.dataset.previewState === 'error') {
            clearTimeout(timeout);
            observer.disconnect();
            if (canvas.dataset.previewState === 'error') {
              reject(new Error(canvas.dataset.previewReason));
            } else {
              resolve();
            }
          }
        });
        observer.observe(canvas, { attributes: true });
      });
    try {
      connection.update(configuration);
      await wait();
      const latency: number[] = [],
        render: number[] = [];
      for (let offset = 0; offset < points.length; offset += 32) {
        const start = performance.now();
        if (offset === 0) {
          connection.begin(points.slice(offset, offset + 32));
        } else {
          connection.add(points.slice(offset, offset + 32));
        }
        await wait();
        latency.push(performance.now() - start);
        render.push(Number(canvas.dataset.previewRenderMs));
      }
      connection.finish();
      await wait();

      // The identical engines/renderer draw directly into a WebGPU canvas, as Paint does, without bitmap transport.
      const target = document.createElement('canvas');
      document.body.append(target);
      const reference = createPreviewRuntime(async (_canvas, lost, options) => {
        _canvas.getContext('2d');
        const renderer = await createPaintRenderer(target, lost, options);
        return {
          ...renderer,
          render: (layers, camera, size, dpr, exact) => renderer.render(layers, camera, size, dpr, exact, target)
        };
      });
      const direct: number[] = [];
      try {
        // Compile and warm resource uploads before timing.
        const warm = await reference.run({
          id: 0,
          target: 1,
          revision: 0,
          action: 'sample',
          configuration,
          points: []
        });
        if (warm.type === 'image') {
          warm.bitmap.close();
        }
        for (let offset = 0; offset < points.length; offset += 32) {
          const start = performance.now();
          const reply = await reference.run({
            id: offset + 1,
            target: 1,
            revision: 1,
            action: offset === 0 ? 'begin' : 'add',
            configuration: offset === 0 ? configuration : undefined,
            points: points.slice(offset, offset + 32)
          });
          if (reply.type === 'error') {
            throw new Error(reply.message);
          }
          if (reply.type === 'image') {
            reply.bitmap.close();
          }
          direct.push(performance.now() - start);
        }
      } finally {
        reference.dispose();
        target.remove();
      }
      results.push({
        kind,
        latency: summarize(latency),
        workerRender: summarize(render),
        paintCanvas: summarize(direct)
      });
    } finally {
      connection.dispose();
      canvas.remove();
    }
  }
  return results;
}
function summarize(values: number[]) {
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  return {
    mean: mean(values),
    p95: values.toSorted((a, b) => a - b)[Math.floor(values.length * 0.95)],
    first: mean(values.slice(1, 11)),
    last: mean(values.slice(-10))
  };
}
