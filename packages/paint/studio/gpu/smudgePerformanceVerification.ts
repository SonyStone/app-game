import { brushToFormValues } from '@app-game/abr-brush/form';
import { tgpu } from 'typegpu';
import { defaultBrush } from '../brush';
import { abrBrush } from '../composition/abrBrushEngine';
import { createBrushResources } from '../composition/brushResources';
import { createResourceSession } from '../composition/resourceSession';
import { createDocument } from '../document';
import { createRawProcessor } from '../strokeProcessors';
import { unpackTile } from '../tilePixels';
import { createPaintRenderer } from './renderer';

/** Repeatable dense-smudge workload with Wet Blender's spacing/scattering, using an isolated sampled tip and document. */
export async function verifySmudgePerformance(
  report: (message: string) => void,
  options: { size?: number; distance?: number; runs?: number; cacheTiles?: number; present?: boolean } = {}
) {
  const size = options.size ?? 50;
  const distance = options.distance ?? 160;
  const root = await tgpu.init();
  const resources = createBrushResources();
  resources.put({
    id: 'perf-tip',
    width: 16,
    height: 16,
    format: 'r8unorm',
    pixels: Uint8Array.from({ length: 256 }, (_, i) => (i % 3 ? 255 : 80))
  });
  const values = brushToFormValues({
    id: 'perf',
    name: 'Dense smudge',
    type: 'sampled',
    settings: {},
    diameter: 50,
    spacing: 3
  });
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
  const errors: string[] = [];
  const warmTimes: number[] = [];
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
    for (let run = 0; run < (options.runs ?? 7); run++) {
      renderer = await createPaintRenderer(new OffscreenCanvas(512, 256), (message) => errors.push(message), {
        device: root.device,
        cacheTiles: options.cacheTiles
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
          brush: { ...defaultBrush(), size, flow: 1, opacity: 1, mixing: 'linear' },
          settings: { tipId: 'perf-tip', values, seed: 12345 }
        })
      );
      const points = Array.from({ length: Math.floor(distance / 4) + 1 }, (_, i) => ({
        x: 160 + i * 4,
        y: 128 + Math.sin(i / 6) * 20,
        pressure: 0.7,
        time: i * 4
      }));
      await root.device.queue.onSubmittedWorkDone();
      submits = 0;
      stamps = 0;
      const start = performance.now();
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
      const elapsed = performance.now() - start;
      const changes = await session.finish();
      let hash = 2166136261;
      for (const change of changes.slice().sort((a, b) => a.key.localeCompare(b.key)))
        if (change.after) for (const byte of unpackTile(change.after)) hash = Math.imul(hash ^ byte, 16777619);
      if (!changes.length || !stamps) throw new Error('Dense smudge produced no ink.');
      if (expectedHash !== undefined && hash !== expectedHash)
        throw new Error('Dense smudge changed pixels between identical runs.');
      expectedHash = hash;
      if (run) warmTimes.push(elapsed);
      if (options.present) report(`Cache readback: ${JSON.stringify(renderer.stats().readback)}`);
      renderer.destroy();
      renderer = undefined;
      report(
        `${run === 0 ? 'cold' : 'warm'}: ${elapsed.toFixed(1)} ms, ${stamps} stamps, ${submits} submissions including finish, pixel hash ${hash >>> 0}`
      );
    }
    warmTimes.sort((a, b) => a - b);
    if (warmTimes.length) {
      const middle = Math.floor(warmTimes.length / 2);
      const median = warmTimes.length % 2 ? warmTimes[middle]! : (warmTimes[middle - 1]! + warmTimes[middle]!) / 2;
      report(`Warm median: ${median.toFixed(1)} ms; ${warmTimes.length} runs, pixels identical.`);
    }
    if (errors.length) throw new Error(errors.join('\n'));
  } finally {
    root.device.queue.submit = original;
    renderer?.destroy();
    resources.dispose();
    root.destroy();
  }
}
