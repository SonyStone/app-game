import { brushToFormValues } from '@app-game/abr-brush/form';
import { createBrushResources } from '@app-game/abr-paint/resources';
import { percent, pixels } from '@app-game/abr-parser';
import { defaultBrush } from '@app-game/paint-core/brush';
import { abrBrush } from '@app-game/paint-core/composition/abrBrushEngine';
import { createResourceSession } from '@app-game/paint-core/composition/resourceSession';
import { createDocument } from '@app-game/paint-core/document';
import { createPaintRenderer } from '@app-game/paint-core/gpu/renderer';
import { createRawProcessor } from '@app-game/paint-core/strokeProcessors';
import { unpackTile } from '@app-game/paint-core/tilePixels';

/** Resource/batching consistency only. These comparisons are not Photoshop reference outputs. */
export async function verifyPatternRetouch(report: (message: string) => void) {
  let cases = 0;
  for (const type of ['SmTl', 'BlTl'] as const)
    for (const eachTip of [true, false]) {
      const separate = await render(type, eachTip, false);
      const batched = await render(type, eachTip, true);
      if (!separate.size || separate.size !== batched.size) throw new Error('Pattern retouch changed its tile set.');
      for (const [key, expected] of separate) {
        const actual = batched.get(key);
        if (!actual || expected.some((byte, i) => byte !== actual[i]))
          throw new Error(
            `Pattern ${type}, eachTip=${eachTip}, tile ${key} changed with direct drawing/batching/eviction.`
          );
      }
      cases++;
      report(`Pattern ${type}, eachTip=${eachTip}: direct drawing/batching/eviction preserved pixels.`);
    }
  return { cases };
}

async function render(type: 'SmTl' | 'BlTl', eachTip: boolean, optimized: boolean) {
  const document = createDocument();
  for (let tx = 0; tx < 2; tx++) {
    const pixels = new Uint8Array(256 * 256 * 4);
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++)
        pixels.set([x % 32 < 16 ? 230 : 40, y % 32 < 16 ? 60 : 170, tx ? 200 : 20, 255], (y * 256 + x) * 4);
    document.active.tiles.set(`${tx},0`, pixels);
  }
  const values = brushToFormValues({
    id: 'pattern-retouch',
    name: 'Pattern retouch',
    preset: {
      kind: 'brush',
      sourceId: 'fixture',
      ...{},
      tip: { kind: 'computed', diameter: pixels(48), spacing: percent(25), hardness: percent(100) }
    },
    resources: [],
    source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
  });
  Object.assign(values.tool, { type, strength: 90, fingerPainting: false });
  values.useTexture = true;
  Object.assign(values.texture, {
    eachTip,
    scale: 60,
    mode: 'Mltp',
    depth: 65,
    depthControl: 0,
    depthJitter: 0,
    brightness: 0,
    contrast: 0,
    invert: false
  });
  const resources = createBrushResources();
  resources.put({ id: 'tip', width: 8, height: 8, format: 'r8unorm', pixels: new Uint8Array(64).fill(255) });
  resources.put({
    id: 'pattern',
    width: 8,
    height: 7,
    format: 'r8unorm',
    pixels: Uint8Array.from({ length: 56 }, (_, i) => (i * 67) % 256)
  });
  const errors: string[] = [];
  const renderer = await createPaintRenderer(new OffscreenCanvas(512, 256), (error) => errors.push(error), {
    cacheTiles: optimized ? 1 : 16,
    directSmudge: optimized,
    batchSmudgePasses: optimized,
    batchSmudgeDabs: optimized,
    sharedScratch: optimized
  });
  try {
    const stroke = createResourceSession(resources, (resources) =>
      abrBrush.engine({
        resources,
        renderer,
        layer: document.active,
        layers: document.layers,
        processor: createRawProcessor(),
        brush: { ...defaultBrush(), size: 48, color: '#000000', flow: 1, opacity: 1, mixing: 'classic' },
        settings: { seed: 123, tipId: 'tip', patternId: 'pattern', values }
      })
    );
    const points = Array.from({ length: 18 }, (_, i) => ({ x: 120 + i * 16, y: 128, pressure: 1, time: i * 16 }));
    for (let i = 0; i < points.length; i += optimized ? points.length : 1)
      await stroke.add(points.slice(i, i + (optimized ? points.length : 1)));
    const changes = await stroke.finish();
    await renderer.submitted();
    if (errors.length) throw new Error(errors.join('\n'));
    const stats = renderer.stats().brushTextures;
    if (stats && 'pendingPatternBytes' in stats && stats.pendingPatternBytes !== 0)
      throw new Error('Pattern replacement textures were retained after submission.');
    return new Map(changes.filter((change) => change.after).map((change) => [change.key, unpackTile(change.after!)]));
  } finally {
    renderer.destroy();
  }
}
