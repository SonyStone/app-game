import type { Brush } from '@app-game/abr-parser/reader';
import { defaultBrush } from '../brush';
import { viewerBrush } from '../brushLibrary/viewerBrush';
import { abrBrush } from '../composition/abrBrushEngine';
import { createBrushResources } from '../composition/brushResources';
import { createResourceSession } from '../composition/resourceSession';
import { createDocument } from '../document';
import { createRawProcessor } from '../strokeProcessors';
import { unpackTile } from '../tilePixels';
import { createPaintRenderer } from './renderer';

/** Replays the native Photoshop fixture’s path with mouse-equivalent samples in document pixels.
 * Returns committed pixels, independent of browser DPR, camera zoom, and presentation filtering.
 */
export async function verifyWetBlender(preset: Brush, report: (message: string) => void): Promise<ImageData> {
  const selected = viewerBrush(preset);
  const values = selected.engine.settings.values;
  if (values.tool.type !== 'SmTl' || values.scattering.scatter !== 208 || selected.size !== 50)
    throw new Error('Expected the original 50 px Wet Blender preset.');
  const document = createDocument();
  const width = 768,
    height = 1024;
  for (let ty = 0; ty < 4; ty++)
    for (let tx = 0; tx < 3; tx++) {
      const pixels = new Uint8Array(256 * 256 * 4);
      for (let y = 0; y < 256; y++)
        for (let x = 0; x < 256; x++) pixels.set(sourceColor(tx * 256 + x, ty * 256 + y), (y * 256 + x) * 4);
      document.active.tiles.set(`${tx},${ty}`, pixels);
    }
  const resources = createBrushResources();
  selected.resources.forEach((resource) => resources.put(resource));
  const errors: string[] = [];
  const renderer = await createPaintRenderer(new OffscreenCanvas(width, height), (error) => errors.push(error));
  try {
    const session = createResourceSession(resources, (resources) =>
      abrBrush.engine({
        resources,
        renderer,
        layer: document.active,
        layers: document.layers,
        processor: createRawProcessor(),
        brush: { ...defaultBrush(), size: 50, flow: 1, opacity: 1, color: '#000000', mixing: 'classic' },
        settings: { ...selected.engine.settings, seed: 12345 }
      })
    );
    await session.add(Array.from({ length: 193 }, (_, i) => ({ x: 384, y: 128 + i * 4, pressure: 1, time: i * 4 })));
    document.commit(await session.finish());
    await renderer.submitted();
    if (errors.length) throw new Error(errors.join('\n'));
    const image = new ImageData(width, height);
    for (const [key, data] of document.active.tiles) {
      const [tx, ty] = key.split(',').map(Number) as [number, number];
      if (tx < 0 || tx >= 3 || ty < 0 || ty >= 4) continue;
      const pixels = unpackTile(data);
      for (let y = 0; y < 256; y++)
        image.data.set(pixels.subarray(y * 256 * 4, (y + 1) * 256 * 4), ((ty * 256 + y) * width + tx * 256) * 4);
    }
    let left = width,
      right = -1;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const before = sourceColor(x, y),
          offset = (y * width + x) * 4;
        if (before.slice(0, 3).some((value, channel) => Math.abs(value - image.data[offset + channel]!) > 4)) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    const spread = right - left + 1;
    if (spread < 140 || spread > 170) throw new Error(`Unexpected Wet Blender footprint: ${spread}px.`);
    report(`Corrected Wet Blender: ${spread}px affected width, mouse pressure 1, 50px tip, 208% scatter.`);
    return image;
  } finally {
    renderer.destroy();
    resources.dispose();
  }
}

/** Same opaque source rectangles as the native ExtendScript probe. */
function sourceColor(x: number, y: number): [number, number, number, number] {
  return y >= 600 ? [0, 210, 90, 255] : x < 384 ? [255, 0, 0, 255] : [0, 128, 200, 255];
}
