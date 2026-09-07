import { brushToFormValues } from '@app-game/abr-brush/form';
import { defaultBrush, type Sample } from '../brush';
import { abrBrush } from '../composition/abrBrushEngine';
import { createBrushResources, type BrushResource } from '../composition/brushResources';
import { createResourceSession } from '../composition/resourceSession';
import { createDocument } from '../document';
import { createRawProcessor } from '../strokeProcessors';
import { unpackTile } from '../tilePixels';
import { createPaintRenderer } from './renderer';

/** Runs against the real GPU in an isolated document. Eviction must preserve every ABR accumulator. */
export async function verifyAbrBrush(report: (message: string) => void) {
  const points: Sample[] = Array.from({ length: 45 }, (_, i) => ({
    x: 60 + (i < 23 ? i : 45 - i) * 28,
    y: 200 + Math.sin(i / 4) * 20,
    pressure: 0.3 + (0.7 * (i % 7)) / 6,
    time: i * 12,
    tiltX: i,
    tiltY: 10,
    rotation: i * 2
  }));
  const values = brushToFormValues({
    id: 'gpu',
    name: 'GPU regression',
    type: 'sampled',
    settings: {},
    spacing: 15,
    diameter: 80
  });
  values.useShapeDynamics = true;
  values.shapeDynamics.angleJitter = 30;
  values.useColorDynamics = true;
  values.colorDynamics.applyPerTip = true;
  values.colorDynamics.hueJitter = 30;
  values.useTransfer = true;
  values.transfer.opacityControl = 2;
  values.useTexture = true;
  values.texture.eachTip = true;
  values.texture.depth = 50;
  values.texture.mode = 'Mltp';
  values.useDualBrush = true;
  values.dualBrush.diameter = 48;
  values.dualBrush.mode = 'Mltp';
  const textures: BrushResource[] = ['tip', 'pattern', 'dual'].map((id, n) => ({
    id,
    width: 8,
    height: 8,
    format: 'r8unorm',
    pixels: Uint8Array.from({ length: 64 }, (_, i) => (n === 1 ? (i % 2 ? 255 : 150) : 255))
  }));
  const run = async (capacity: number, batch: number, withPreview: boolean) => {
    const document = createDocument();
    const resources = createBrushResources();
    textures.forEach((resource) => resources.put(resource));
    const errors: string[] = [];
    const renderer = await createPaintRenderer(new OffscreenCanvas(800, 400), (error) => errors.push(error), {
      cacheTiles: capacity
    });
    try {
      const brush = {
        ...defaultBrush(),
        color: '#b73a34',
        flow: 0.6,
        opacity: 0.7,
        size: 80,
        mixing: 'classic' as const
      };
      let endpoint = points[0]!;
      const stroke = createResourceSession(resources, (resources) =>
        abrBrush.engine({
          brush,
          layer: document.active,
          resources,
          renderer,
          processor: {
            ...createRawProcessor(),
            preview: () => [{ ...endpoint, x: endpoint.x + 14, y: endpoint.y + 10 }]
          },
          settings: { seed: 12345, tipId: 'tip', patternId: 'pattern', dualId: 'dual', values }
        })
      );
      for (let i = 0; i < points.length; i += batch) {
        endpoint = points[Math.min(points.length - 1, i + batch - 1)]!;
        await stroke.add(points.slice(i, i + batch));
        if (withPreview) {
          stroke.preview(true);
          await renderer.render(
            document.layers,
            { x: 400, y: 200, zoom: 1, angle: 0, mirrored: false },
            { width: 800, height: 400 },
            1
          );
          stroke.preview(false);
        }
      }
      const changes = await stroke.finish();
      await renderer.submitted();
      if (errors.length) throw new Error(errors.join('\n'));
      return new Map(changes.filter((change) => change.after).map((change) => [change.key, unpackTile(change.after!)]));
    } finally {
      renderer.destroy();
    }
  };
  const reference = await run(64, 1, false),
    evicted = await run(1, 1, true),
    batched = await run(64, 9, false);
  if (!reference.size) throw new Error('ABR stroke produced no tiles.');
  let colored = 0;
  for (const [key, pixels] of reference) {
    for (const result of [evicted, batched]) {
      const actual = result.get(key);
      if (!actual || actual.length !== pixels.length || pixels.some((value, i) => value !== actual[i]))
        throw new Error(`ABR tile ${key} changed with eviction or event batching.`);
    }
    colored += pixels.filter((value, i) => i % 4 === 3 && value > 0).length;
  }
  if (colored < 100) throw new Error('ABR primary/dual/texture combination did not leave visible ink.');
  report(`ABR GPU: ${reference.size} tiles, ${colored} painted pixels; eviction and batching are pixel-identical.`);
}
