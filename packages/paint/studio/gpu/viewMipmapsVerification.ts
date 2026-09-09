import type { TgpuRoot } from 'typegpu';
import { defaultBrush } from '../brush';
import { createDocument } from '../document';
import { createPaintRenderer } from './renderer';

/** Compares displayed pixels across zoom, rotation, live edits, tails, commit and cold coarse-cache promotion. */
export async function verifyViewMipmaps(root: TgpuRoot) {
  const frames = [
    { zoom: 1, angle: 0, edit: false },
    { zoom: 0.5, angle: 0.2, edit: false },
    { zoom: 0.25, angle: -0.7, edit: false },
    { zoom: 0.25, angle: -0.7, edit: true },
    { zoom: 0.04, angle: 0.71, edit: true },
    { zoom: 1.3, angle: 0.4, edit: true },
    { zoom: 0.125, angle: -0.2, edit: false },
    { zoom: 0.07, angle: 0.51, edit: false },
    { zoom: 0.4, angle: -0.34, edit: false },
    { zoom: 0.8, angle: 0.2, edit: false }
  ];
  const run = async (adaptiveMipmaps: boolean, batchedMipmaps: boolean) => {
    const canvas = new OffscreenCanvas(317, 239);
    const errors: string[] = [];
    const renderer = await createPaintRenderer(canvas, (error) => errors.push(error), {
      device: root.device,
      adaptiveMipmaps,
      batchedMipmaps
    });
    const document = createDocument();
    const pixels = Uint8Array.from({ length: 256 * 256 * 4 }, (_, i) => {
      const x = Math.floor(i / 4) % 256,
        y = Math.floor(i / 1024);
      const alpha = (x + y) % 3 ? 255 : 80;
      return [x % 2 ? alpha : 0, y % 7 ? 0 : alpha, (x + y) % 13 ? alpha : 0, alpha][i % 4]!;
    });
    for (const key of ['-1,-1', '-1,0', '0,-1', '0,0']) document.active.tiles.set(key, pixels);
    const result: Uint8ClampedArray[] = [];
    try {
      for (const [index, frame] of frames.entries()) {
        if (index === 3) renderer.begin(document.active, { ...defaultBrush(), color: '#0088ff', size: 80 });
        if (frame.edit) {
          await renderer.paint([{ x: index * 5, y: 6, radius: 40, flow: 0.6 }]);
          renderer.preview([{ x: index * 5 + 20, y: 10, radius: 40, flow: 0.6 }]);
        }
        if (index === 6) document.commit(await renderer.finish());
        if (index === 7) renderer.reset();
        await renderer.render(
          document.layers,
          { x: 8.3, y: -3.7, zoom: frame.zoom, angle: frame.angle, mirrored: index % 2 === 1 },
          { width: 317, height: 239 },
          1.25
        );
        await renderer.submitted();
        const read = new OffscreenCanvas(canvas.width, canvas.height).getContext('2d')!;
        read.drawImage(canvas, 0, 0);
        result.push(read.getImageData(0, 0, canvas.width, canvas.height).data);
      }
      if (errors.length) throw new Error(errors.join('\n'));
      return result;
    } finally {
      renderer.destroy();
    }
  };
  const reference = await run(false, false);
  const adaptive = await run(true, true);
  for (const [index, pixels] of reference.entries()) {
    const actual = adaptive[index]!;
    const difference = actual.findIndex((value, channel) => value !== pixels[channel]);
    if (actual.length !== pixels.length || difference !== -1)
      throw new Error(`Batched/adaptive mipmaps changed frame ${index}, byte ${difference}.`);
  }
}
