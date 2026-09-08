import { defaultBrush } from '../brush';
import { viewerBrush } from '../brushLibrary/viewerBrush';
import { abrBrush } from '../composition/abrBrushEngine';
import { createBrushResources } from '../composition/brushResources';
import { createResourceSession } from '../composition/resourceSession';
import { createDocument } from '../document';
import { createRawProcessor } from '../strokeProcessors';
import { unpackTile } from '../tilePixels';
import { createPaintRenderer } from './renderer';

/** Pixel and ownership invariants for canvas retouching. Native kernel/Protect Detail parity is not assumed. */
export async function verifyAbrFilter(report: (message: string) => void) {
  const blurred = await render({ type: 'BlTl' }),
    sharp = await render({ type: 'ShTl', protect: false });
  const protectedSharp = await render({ type: 'ShTl', protect: true });
  const originalHigh = 174,
    originalLow = 50;
  if (Math.abs(blurred[255 * 4]! - 142) > 1 || Math.abs(blurred[256 * 4]! - 82) > 1)
    throw new Error(
      'The filter halo was resampled, applied twice after cancel, or contaminated by a written neighbour.'
    );
  if (
    !(
      blurred[255 * 4]! < originalHigh &&
      blurred[256 * 4]! > originalLow &&
      sharp[255 * 4]! > originalHigh &&
      sharp[256 * 4]! < originalLow
    )
  )
    throw new Error('Blur/Sharpen did not lower/increase contrast across the tile boundary.');
  if (protectedSharp[255 * 4]! >= sharp[255 * 4]! || protectedSharp[256 * 4]! <= sharp[256 * 4]!)
    throw new Error('Protect Detail did not limit overshoot.');
  const weak = await render({ type: 'BlTl', strength: 25 }),
    zero = await render({ type: 'BlTl', strength: 0 });
  if (!(weak[255 * 4]! > blurred[255 * 4]! && weak[255 * 4]! < originalHigh && zero[255 * 4] === originalHigh))
    throw new Error('Retouch Strength did not control the filter amount.');
  const large = await render({ type: 'BlTl', size: 512 });
  for (const x of [254, 255, 256, 257])
    if (blurred[x * 4] !== large[x * 4]) throw new Error('A large retouch brush changed document-pixel filtering.');
  const streamed = await render({ type: 'BlTl', path: true });
  const evicted = await render({ type: 'BlTl', path: true, cache: 1, batch: 7 });
  if (streamed.some((value, i) => value !== evicted[i]))
    throw new Error('Retouch depends on event batching or tile eviction.');
  const empty = await render({ type: 'BlTl', otherLayer: true });
  const all = await render({ type: 'BlTl', otherLayer: true, allLayers: true });
  if (empty.some(Boolean) || all[256 * 4 + 3] !== 255 || all[256 * 4]! < 60)
    throw new Error('Retouch did not honor current/all-layer sampling.');
  const half = await render({ type: 'BlTl', alpha: 128 });
  if (half[256 * 4 + 3] !== 128 || half[256 * 4]! > 128 || half[256 * 4] !== half[256 * 4 + 2])
    throw new Error('Retouch lost premultiplied alpha or injected the foreground color.');
  const darken = await render({ type: 'BlTl', mode: 'Drkn' });
  const lighten = await render({ type: 'BlTl', mode: 'Lghn' });
  if (
    darken[256 * 4] !== originalLow ||
    lighten[255 * 4] !== originalHigh ||
    darken[255 * 4] !== blurred[255 * 4] ||
    lighten[256 * 4] !== blurred[256 * 4]
  )
    throw new Error('Retouch Mode did not restrict darkening/lightening of the captured image.');
  report(
    'ABR Blur/Sharpen: Strength, contrast, Protect Detail, full-resolution 512px brush, tile halos, batching/eviction, current/all layers, premultiplied alpha, cancellation and undo/redo passed.'
  );
}

async function render(options: {
  type: 'BlTl' | 'ShTl';
  protect?: boolean;
  strength?: number;
  size?: number;
  path?: boolean;
  cache?: number;
  batch?: number;
  otherLayer?: boolean;
  allLayers?: boolean;
  alpha?: number;
  mode?: 'Nrml' | 'Drkn' | 'Lghn';
}) {
  const document = createDocument();
  const alpha = options.alpha ?? 255;
  for (let tx = 0; tx < 2; tx++) {
    const pixels = new Uint8Array(256 * 256 * 4);
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++) {
        const value = Math.round(((50 + (x % 32) * 4) * alpha) / 255);
        pixels.set([value, value, value, alpha], (y * 256 + x) * 4);
      }
    document.active.tiles.set(`${tx},0`, pixels);
  }
  if (options.otherLayer) document.changeLayer({ type: 'add' });
  const before = new Map(document.active.tiles);
  const preset = viewerBrush({
    id: 'filter-qa',
    name: 'Retouch',
    type: 'computed',
    diameter: options.size ?? 32,
    hardness: 100,
    spacing: 25,
    settings: {
      toolOptions: {
        __classId: options.type,
        'Prs ': options.strength ?? 100,
        BlrS: options.allLayers ?? false,
        detailBoost: options.protect ?? false,
        'Md  ': { type: 'BlnM', value: options.mode ?? 'Nrml' }
      }
    }
  });
  const resources = createBrushResources();
  for (const resource of preset.resources) resources.put(resource);
  const errors: string[] = [];
  const renderer = await createPaintRenderer(new OffscreenCanvas(512, 256), (message) => errors.push(message), {
    cacheTiles: options.cache ?? 16
  });
  try {
    const stroke = () =>
      createResourceSession(resources, (resources) =>
        abrBrush.engine({
          resources,
          renderer,
          brush: {
            ...defaultBrush(),
            mixing: 'classic',
            size: options.size ?? 32,
            flow: 0.1,
            opacity: 0.1,
            color: '#ff0000'
          },
          layer: document.active,
          layers: document.layers,
          processor: createRawProcessor(),
          settings: { ...preset.engine.settings, seed: 1 }
        })
      );
    const cancelled = stroke();
    await cancelled.add([{ x: 256, y: 128, pressure: 1, time: 0 }]);
    cancelled.cancel();
    const current = stroke();
    const points = options.path
      ? Array.from({ length: 9 }, (_, i) => ({ x: 240 + i * 4, y: 128, pressure: 1, time: i * 8 }))
      : [{ x: 256, y: 128, pressure: 1, time: 0 }];
    for (let i = 0; i < points.length; i += options.batch ?? 1) {
      await current.add(points.slice(i, i + (options.batch ?? 1)));
      current.preview(true);
    }
    document.commit(await current.finish());
    await renderer.submitted();
    if (errors.length) throw new Error(errors.join('\n'));
    const result = new Uint8Array(512 * 4);
    for (let x = 0; x < 2; x++) {
      const tile = document.active.tiles.get(`${x},0`);
      if (tile) result.set(unpackTile(tile).subarray(128 * 256 * 4, 129 * 256 * 4), x * 256 * 4);
    }
    if (document.state().canUndo) {
      const after = new Map(document.active.tiles);
      const equal = (expected: typeof before) => {
        if (expected.size !== document.active.tiles.size) throw new Error('Retouch history changed the tile count.');
        for (const [key, pixels] of expected) {
          const actual = document.active.tiles.get(key);
          const actualPixels = actual ? unpackTile(actual) : undefined;
          if (!actualPixels || unpackTile(pixels).some((v, i) => v !== actualPixels[i]))
            throw new Error('Retouch history changed pixels.');
        }
      };
      document.undo();
      equal(before);
      document.redo();
      equal(after);
    }
    return result;
  } finally {
    renderer.destroy();
    resources.dispose();
  }
}
