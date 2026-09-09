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

/** Checks scratch ownership transitions against per-tile storage, including a cache larger than the persistent limit. */
export async function verifySamplingScratch(report: (message: string) => void) {
  const root = await tgpu.init();
  const resources = createBrushResources();
  resources.put({ id: 'scratch-tip', width: 8, height: 8, format: 'r8unorm', pixels: new Uint8Array(64).fill(255) });
  const run = async (sharedScratch: boolean) => {
    const errors: string[] = [];
    const renderer = await createPaintRenderer(new OffscreenCanvas(512, 256), (error) => errors.push(error), {
      device: root.device,
      sharedScratch
    });
    const document = createDocument();
    // Finger Painting seeds empty tiles, so this exercises pixel residency without allocating a dense source document.
    const stages = ['wide', 'paint', 'dual', 'cancel', 'resume', 'reset'] as const;
    try {
      for (const stage of stages) {
        if (stage === 'reset') renderer.reset();
        const values = brushToFormValues({
          id: 'scratch-preset',
          name: 'Scratch lifecycle',
          type: 'sampled',
          settings: {},
          diameter: 64,
          spacing: 100
        });
        if (stage !== 'paint') {
          values.tool.type = 'SmTl';
          values.tool.strength = 80;
          values.tool.fingerPainting = true;
        }
        values.useDualBrush = stage === 'dual';
        values.dualBrush.diameter = 32;
        const stroke = createResourceSession(resources, (resources) =>
          abrBrush.engine({
            resources,
            renderer,
            layer: document.active,
            layers: document.layers,
            processor: createRawProcessor(),
            brush: { ...defaultBrush(), size: 64, color: '#ff0000', flow: 1, opacity: 0.8, mixing: 'linear' },
            settings: { tipId: 'scratch-tip', dualId: 'scratch-tip', values, seed: 123 }
          })
        );
        await stroke.add(
          Array.from({ length: stage === 'wide' ? 145 : 9 }, (_, i) => ({
            x: stage === 'wide' ? 128 + i * 256 : 128 + i * 32,
            y: 128,
            pressure: 1,
            time: i * 16
          }))
        );
        if (stage === 'cancel') stroke.cancel();
        else document.commit(await stroke.finish());
        const stats = renderer.stats();
        if (sharedScratch && stage === 'wide' && stats.residentTiles <= 128)
          throw new Error('Sampling did not use the larger pixel cache.');
        if ((stage === 'paint' || stage === 'dual') && (stats.residentTiles > 128 || stats.samplingScratchTiles !== 0))
          throw new Error('Persistent brush retained the expanded sampling cache or scratch pool.');
      }
      await renderer.submitted();
      if (errors.length) throw new Error(errors.join('\n'));
      return new Map([...document.active.tiles].map(([key, pixels]) => [key, unpackTile(pixels)]));
    } finally {
      renderer.destroy();
    }
  };
  try {
    const reference = await run(false);
    const pooled = await run(true);
    if (reference.size !== pooled.size) throw new Error('Scratch transitions changed document tile count.');
    for (const [key, pixels] of reference) {
      const actual = pooled.get(key);
      if (!actual || actual.some((value, i) => value !== pixels[i]))
        throw new Error(`Scratch transitions changed pixels in ${key}.`);
    }
    report(
      'Sampling scratch: expanded cache, Paint/Dual Brush transitions, cancel, reset and reuse match per-tile storage exactly.'
    );
  } finally {
    resources.dispose();
    root.destroy();
  }
}
