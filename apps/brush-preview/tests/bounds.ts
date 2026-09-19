import { defaultBrush } from '@app-game/paint-core/brush';
import { defaultCamera } from '@app-game/paint-core/camera';
import { createDocument } from '@app-game/paint-core/document';
import { createPaintRenderer } from '@app-game/paint-core/gpu/renderer';
import { unpackTile } from '@app-game/paint-core/tilePixels';
import { createRawProcessor } from '@app-game/paint-core/strokeProcessors';
import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import { createAbrStroke } from '@app-game/abr-paint';
import { createBrushResources } from '@app-game/abr-paint/resources';
import { initAbr, percent, pixels } from '@app-game/abr-parser';

/** Real GPU coverage check for a fixed extent cutting through tile interiors, including canvas-sampling tools. */
export async function verifyPreviewBounds() {
  await initAbr();
  const bounds = { x: 67, y: 33, width: 310, height: 280 };
  const canvas = new OffscreenCanvas(512, 512), errors: string[] = [];
  const renderer = await createPaintRenderer(canvas, message => errors.push(message), { bounds, cacheTiles: 2 });
  const doc = createDocument();
  const resources = createBrushResources();
  const brush = { ...defaultBrush(), color: '#ed384f', hardness: 1, opacity: 1, flow: 1 };
  try {
    renderer.begin(doc.active, brush);
    await renderer.paint([{ x: 140, y: 120, radius: 400, flow: 1 }]);
    renderer.preview([{ x: 10, y: 10, radius: 100, flow: 1 }]);
    await renderer.render(doc.layers, { ...defaultCamera(), x: 256, y: 256 }, { width: 512, height: 512 }, 1);
    await renderer.submitted();
    const snapshot = new OffscreenCanvas(512, 512).getContext('2d')!;
    snapshot.drawImage(canvas, 0, 0);
    const outside = snapshot.getImageData(20, 20, 1, 1).data;
    if (outside[0]! < 240 || outside[1]! < 240 || outside[2]! < 240) throw new Error('Preview escaped fixed drawing bounds.');
    doc.commit(await renderer.finish());
    check();
    for (const type of ['PbTl', 'SmTl', 'BlTl', 'ShTl', 'MixB', 'ErTl']) {
      const preset = prepareAbrBrush({
        id: type,
        name: type,
        preset: {
          kind: 'brush', sourceId: 'bounds-fixture',
          tip: { kind: 'computed', spacing: percent(15), diameter: pixels(180) },
          toolOptions: { kind: type, strength: 70 }
        },
        resources: [],
        source: { format: 'photoshop-abr/v1', bytes: new Uint8Array() }
      });
      for (const resource of preset.resources) resources.put(resource);
      const scope = resources.open();
      const stroke = createAbrStroke({ settings: { ...preset.engine.settings, seed: 123 }, resources: scope,
        brush: { ...brush, size: 180 }, layer: doc.active, layers: doc.layers, processor: createRawProcessor(), renderer });
      try {
        await stroke.add([{ x: 150, y: 100, pressure: 1, time: 0 }, { x: -40, y: -30, pressure: 1, time: 100 }]);
        doc.commit(await stroke.finish());
        check();
      } finally { scope.release(); }
    }
    if (errors.length) throw new Error(errors.join('; '));
    return 'Fixed bounds passed for round/ABR paint, preview, Smudge, Blur, Sharpen, Mixer and Eraser with two-tile eviction.';
  } finally { renderer.destroy(); resources.dispose(); }

  function check() {
    for (const [key, stored] of doc.active.tiles) {
      if (!(stored instanceof Uint8Array)) throw new Error('Unexpected external tile.');
      const pixels = unpackTile(stored), [tx, ty] = key.split(',').map(Number);
      for (let i = 0; i < 256 * 256; i++) {
        const x = tx! * 256 + i % 256, y = ty! * 256 + Math.floor(i / 256);
        if ((x < bounds.x || x >= bounds.x + bounds.width || y < bounds.y || y >= bounds.y + bounds.height) && pixels[i * 4 + 3])
          throw new Error(`Paint escaped fixed drawing bounds at ${x},${y}.`);
      }
    }
  }
}
