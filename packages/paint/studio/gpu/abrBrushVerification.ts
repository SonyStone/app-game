import { brushToFormValues } from '@app-game/abr-brush/form';
import { defaultBrush, type Sample } from '../brush';
import { abrBrush } from '../composition/abrBrushEngine';
import { createBrushResources, type BrushResource } from '../composition/brushResources';
import { createResourceSession } from '../composition/resourceSession';
import { createDocument } from '../document';
import { createRawProcessor } from '../strokeProcessors';
import { unpackTile } from '../tilePixels';
import { verifyAbrEraser } from './abrEraserVerification';
import { verifyAbrFilter } from './abrFilterVerification';
import { verifyAbrMixer } from './abrMixerVerification';
import { verifyAbrPencil } from './abrPencilVerification';
import { verifyAbrSmudge } from './abrSmudgeVerification';
import { verifyCanvasPickup } from './canvasPickupVerification';
import { createPaintRenderer } from './renderer';
import { verifySamplingScratch } from './samplingScratchVerification';

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
  for (const mode of ['Mltp', 'hardMix']) {
    values.dualBrush.mode = mode;
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
    report(
      `ABR GPU ${mode}: ${reference.size} tiles, ${colored} painted pixels; eviction and batching are pixel-identical.`
    );
  }
  await verifyPressureFade(report);
  await verifyAbrEraser(report);
  await verifyCanvasPickup(report);
  await verifyAbrSmudge(report);
  await verifySamplingScratch(report);
  await verifyAbrMixer(report);
  await verifyAbrFilter(report);
  await verifyAbrPencil(report);
}

/** Hard Mix changes tip coverage, but must not turn pressure-controlled opacity back into opaque ink. */
async function verifyPressureFade(report: (message: string) => void) {
  const values = brushToFormValues({
    id: 'fade',
    name: 'Pressure fade',
    type: 'computed',
    settings: {},
    diameter: 16,
    spacing: 10
  });
  values.useTransfer = true;
  values.transfer.opacityControl = 2;
  values.useDualBrush = true;
  values.dualBrush.mode = 'hardMix';
  values.dualBrush.diameter = 16;
  values.dualBrush.spacing = 10;
  const resource: BrushResource = {
    id: 'solid',
    width: 8,
    height: 8,
    format: 'r8unorm',
    pixels: new Uint8Array(64).fill(255)
  };
  // A gray sampled tip catches the real Charcoal failure: a white test tip cannot
  // distinguish raw tablet opacity from opacity multiplied by the tip's coverage.
  const grayTip: BrushResource = { ...resource, id: 'gray', pixels: new Uint8Array(64).fill(64) };
  const resources = createBrushResources();
  resources.put(resource);
  resources.put(grayTip);
  const errors: string[] = [];
  const renderer = await createPaintRenderer(new OffscreenCanvas(256, 256), (error) => errors.push(error));
  try {
    for (const tip of [resource, grayTip])
      for (const opacity of [1, 0.25]) {
        renderer.reset();
        const document = createDocument();
        const brush = { ...defaultBrush(), size: 16, flow: 1, opacity, color: '#000000', mixing: 'classic' as const };
        const stroke = createResourceSession(resources, (resources) =>
          abrBrush.engine({
            brush,
            layer: document.active,
            resources,
            renderer,
            processor: createRawProcessor(),
            settings: { seed: 1, tipId: tip.id, dualId: resource.id, values }
          })
        );
        await stroke.add(
          Array.from({ length: 101 }, (_, i) => ({
            x: 28 + i * 2,
            y: 128,
            time: i * 8,
            pressure: 1 - i / 100
          }))
        );
        const changes = await stroke.finish();
        await renderer.submitted();
        const tile = changes.find((change) => change.key === '0,0')?.after;
        if (!tile) throw new Error('Pressure fade produced no tile.');
        const pixels = unpackTile(tile);
        const alphaAt = (x: number) => pixels[(128 * 256 + x) * 4 + 3]!;
        const head = alphaAt(48),
          middle = alphaAt(128),
          tail = alphaAt(218);
        if (head < opacity * 255 * 0.85)
          throw new Error(`Hard Mix incorrectly capped ${tip.id} tip density at ${head} for tool opacity ${opacity}.`);
        if (!(head > middle && middle > tail && tail < opacity * 255 * 0.2))
          throw new Error(`Dual Hard Mix lost the pressure fade at opacity ${opacity}: ${head}, ${middle}, ${tail}`);
        if (pixels.some((value, i) => i % 4 === 3 && value > Math.ceil(opacity * 255)))
          throw new Error(`Dual Hard Mix exceeded tool opacity ${opacity}.`);
        report(`ABR Hard Mix ${tip.id} tip opacity ${opacity}: head/middle/tail alpha ${head}/${middle}/${tail}.`);
      }
    if (errors.length) throw new Error(errors.join('\n'));
  } finally {
    renderer.destroy();
  }
}
