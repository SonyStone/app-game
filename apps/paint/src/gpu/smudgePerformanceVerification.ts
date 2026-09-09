import type { ColorMixing } from '@app-game/abr-brush/effects';
import { brushToFormValues } from '@app-game/abr-brush/form';
import type { Brush } from '@app-game/abr-parser/reader';
import { tgpu } from 'typegpu';
import { defaultBrush } from '../brush';
import { viewerBrush } from '../brushLibrary/viewerBrush';
import { abrBrush } from '../composition/abrBrushEngine';
import { createBrushResources } from '../composition/brushResources';
import { createResourceSession } from '../composition/resourceSession';
import { createDocument } from '../document';
import { createRawProcessor } from '../strokeProcessors';
import { unpackTile } from '../tilePixels';
import { createPaintRenderer } from './renderer';

/** Repeatable Smudge workload in an isolated document, using either a real ABR preset or a synthetic dense tip. */
export async function verifySmudgePerformance(
  report: (message: string) => void,
  options: {
    size?: number;
    /** Use a real ABR preset and decoded resources instead of the synthetic tip/settings. */
    preset?: Brush;
    /** Smooth color by default; Classic also exercises mipmaps used by minified canvas pickup. */
    mixing?: ColorMixing;
    distance?: number;
    runs?: number;
    cacheTiles?: number;
    present?: boolean;
    /** Compare full mip chains against view-required levels with identical shaders, pickup and scratch budgets. */
    compareReference?: boolean;
    /** Compare cached/batched view and demand-generated pickup mipmaps against the previous per-level full pickup chain. */
    compareMipBatch?: boolean;
    /** Compare completion-only display against progress frames inside one long pointer segment. */
    compareProgress?: boolean;
    /** Isolate per-dab submission batching at the same sampling, mipmap and display settings. */
    compareDabBatch?: boolean;
    /** Compare eight-dab batching against the one-submission-per-dab path. */
    compareMultiDab?: boolean;
  } = {}
) {
  const size = options.size ?? 50;
  const distance = options.distance ?? 160;
  const selected = options.preset ? viewerBrush(options.preset) : undefined;
  const root = await tgpu.init();
  const resources = createBrushResources();
  if (selected) selected.resources.forEach((resource) => resources.put(resource));
  else
    resources.put({
      id: 'perf-tip',
      width: 16,
      height: 16,
      format: 'r8unorm',
      pixels: Uint8Array.from({ length: 256 }, (_, i) => (i % 3 ? 255 : 80))
    });
  const values =
    selected?.engine.settings.values ??
    brushToFormValues({
      id: 'perf',
      name: 'Dense smudge',
      type: 'sampled',
      settings: {},
      diameter: 50,
      spacing: 3
    });
  if (!selected) {
    Object.assign(values.tool, { type: 'SmTl', strength: 90 });
    values.angle = 14;
    values.useShapeDynamics = true;
    Object.assign(values.shapeDynamics, { sizeControl: 2, angleJitter: 100 });
    values.useScattering = true;
    Object.assign(values.scattering, {
      scatter: 208,
      bothAxes: true,
      control: 2,
      count: 3,
      countJitter: 100,
      countControl: 2
    });
  }
  const errors: string[] = [];
  const warmTimes: number[] = [];
  const referenceTimes: number[] = [];
  const runs = options.runs ?? 7;
  const firstRun = options.compareReference ? -runs : 0;
  let expectedHash: number | undefined;
  let renderer: Awaited<ReturnType<typeof createPaintRenderer>> | undefined;
  const original = root.device.queue.submit;
  let submits = 0,
    stamps = 0;
  root.device.queue.submit = function (buffers) {
    submits++;
    return original.call(this, buffers);
  };
  try {
    const schedule = Array.from({ length: runs }, (_, run) =>
      options.compareReference ? [run - runs, run] : [run]
    ).flat();
    for (const run of schedule) {
      let lastPresented = 0;
      const frameGaps: number[] = [];
      const presentProgress = async () => {
        await renderer!.render(
          document.layers,
          { x: 160 + distance / 2, y: 128, zoom: 512 / (distance + size * 3), angle: 0, mirrored: false },
          { width: 512, height: 256 },
          1
        );
        await renderer!.submitted();
        const now = performance.now();
        frameGaps.push(now - lastPresented);
        lastPresented = now;
      };
      renderer = await createPaintRenderer(new OffscreenCanvas(512, 256), (message) => errors.push(message), {
        device: root.device,
        cacheTiles: options.cacheTiles,
        directSmudge: true,
        batchSmudgeDabs: !options.compareMultiDab || run >= 0,
        batchSmudgePasses: !options.compareDabBatch || run >= 0,
        sharedScratch: true,
        batchPickupUploads: true,
        adaptiveMipmaps:
          options.compareMultiDab ||
          options.compareDabBatch ||
          options.compareProgress ||
          options.compareMipBatch ||
          run >= 0,
        batchedMipmaps: !options.compareMipBatch || run >= 0,
        adaptivePickupMipmaps: !options.compareMipBatch || run >= 0,
        onPaintProgress:
          options.compareProgress && run >= 0
            ? async () => {
                if (performance.now() - lastPresented >= 8) await presentProgress();
              }
            : undefined
      });
      const activeRenderer = renderer;
      const document = createDocument();
      for (let x = -1; x <= Math.ceil((160 + distance) / 256); x++) {
        const pixels = Uint8Array.from(
          { length: 256 * 256 * 4 },
          (_, i) => [x < 1 ? 255 : 0, x < 1 ? 0 : 255, 0, 255][i % 4]!
        );
        document.active.tiles.set(`${x},0`, pixels);
      }
      const session = createResourceSession(resources, (resources) =>
        abrBrush.engine({
          resources,
          layer: document.active,
          layers: document.layers,
          processor: createRawProcessor(),
          renderer: {
            ...activeRenderer,
            paint(dabs) {
              stamps += dabs.length;
              return activeRenderer.paint(dabs);
            }
          },
          brush: { ...defaultBrush(), size, flow: 1, opacity: 1, mixing: options.mixing ?? 'linear' },
          settings: { ...(selected?.engine.settings ?? { tipId: 'perf-tip', values }), seed: 12345 }
        })
      );
      let points = Array.from({ length: Math.floor(distance / 4) + 1 }, (_, i) => ({
        x: 160 + i * 4,
        y: 128 + Math.sin(i / 6) * 20,
        pressure: selected ? 1 : 0.7,
        time: i * 4
      }));
      if (options.compareProgress) points = [points[0]!, { ...points[0]!, x: 160 + distance, time: 50 }];
      await root.device.queue.onSubmittedWorkDone();
      submits = 0;
      stamps = 0;
      const start = performance.now();
      lastPresented = start;
      for (let offset = 0; offset < points.length; offset += options.present ? 16 : points.length) {
        await session.add(points.slice(offset, offset + (options.present ? 16 : points.length)));
        if (options.present) {
          await activeRenderer.render(
            document.layers,
            { x: points[offset]!.x, y: 128, zoom: 0.25, angle: 0, mirrored: false },
            { width: 512, height: 256 },
            1
          );
          await root.device.queue.onSubmittedWorkDone();
        }
      }
      await root.device.queue.onSubmittedWorkDone();
      if (options.compareProgress) await presentProgress();
      const elapsed = performance.now() - start;
      if (options.compareProgress)
        report(
          `Progress ${run < 0 ? 'off' : 'on'}: ${frameGaps.length} frames, first ${frameGaps[0]!.toFixed(1)} ms, longest gap ${Math.max(...frameGaps).toFixed(1)} ms.`
        );
      const finishStart = performance.now();
      const changes = await session.finish();
      const finishMs = performance.now() - finishStart;
      let hash = 2166136261;
      for (const change of changes.slice().sort((a, b) => a.key.localeCompare(b.key)))
        if (change.after) for (const byte of unpackTile(change.after)) hash = Math.imul(hash ^ byte, 16777619);
      if (!changes.length || !stamps) throw new Error('Dense smudge produced no ink.');
      if (expectedHash !== undefined && hash !== expectedHash)
        throw new Error('Smudge pixels differ between reference, optimized, or repeated runs.');
      expectedHash = hash;
      if (run > 0) warmTimes.push(elapsed);
      if (run < 0 && run > firstRun) referenceTimes.push(elapsed);
      if (options.present)
        report(
          `Cache: ${renderer.stats().residentTiles} pixels, ${renderer.stats().samplingScratchTiles} scratch, ${(renderer.stats().gpuBytes / 1048576).toFixed(1)} MiB; readback: ${JSON.stringify(renderer.stats().readback)}`
        );
      renderer.destroy();
      renderer = undefined;
      report(
        `${run === firstRun && run < 0 ? 'reference cold' : run < 0 ? 'reference warm' : run === 0 ? 'cold' : 'warm'}: ${elapsed.toFixed(1)} ms + ${finishMs.toFixed(1)} ms finish, ${stamps} stamps, ${submits} submissions including finish, pixel hash ${hash >>> 0}`
      );
    }
    for (const [label, times] of [
      ['Reference warm', referenceTimes],
      ['Warm', warmTimes]
    ] as const) {
      times.sort((a, b) => a - b);
      if (!times.length) continue;
      const middle = Math.floor(times.length / 2);
      const median = times.length % 2 ? times[middle]! : (times[middle - 1]! + times[middle]!) / 2;
      report(`${label} median: ${median.toFixed(1)} ms; ${times.length} runs, pixels identical.`);
    }
    if (errors.length) throw new Error(errors.join('\n'));
  } finally {
    root.device.queue.submit = original;
    renderer?.destroy();
    resources.dispose();
    root.destroy();
  }
}
