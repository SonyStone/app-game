import { createDocument, type BlendMode, type Layer } from '@app-game/paint-core/document';
import { createPaintRenderer } from '@app-game/paint-core/gpu/renderer';
import { mergeTilePixels } from '@app-game/paint-core/layerMerge';
import { unpackTile } from '@app-game/paint-core/tilePixels';

/**
 * Merging a layer down must not change what the canvas shows. Each case renders a stack, merges its top layer into
 * the layer below with the runtime's CPU composite (`mergeTilePixels`) and renders it again; every presented pixel
 * must stay within 2 levels. The cases cover gradients of color and coverage, tiles only one of the two layers has, a
 * translucent lower layer over another Normal layer, in encoded sRGB and in linear light (Smooth color), and every mode
 * over an opaque lower layer: the cases where merging is exact.
 */
export async function verifyLayerMerge(report: (message: string) => void) {
  const cases: {
    name: string;
    under?: Fill;
    lower: Fill;
    /** The lower layer's blend mode; new layers default to Normal. */
    lowerBlend?: BlendMode;
    upper: Fill;
    blend: BlendMode;
    opacity: number;
    /** The document blends in linear light ("Smooth color"). */
    linear?: boolean;
  }[] = [
    { name: 'normal 60% over opaque', lower: opaque, upper: gradient, blend: 'normal', opacity: 0.6 },
    { name: 'smooth color 70% over opaque', lower: opaque, upper: gradient, blend: 'normal', opacity: 0.7, linear: true },
    { name: 'smooth color multiply over opaque', lower: opaque, upper: gradient, blend: 'multiply', opacity: 0.9, linear: true },
    {
      name: 'normal over translucent normal, layer below',
      under: opaque,
      lower: gradient,
      lowerBlend: 'normal',
      upper: wash,
      blend: 'normal',
      opacity: 1
    },
    {
      name: 'smooth color over translucent, layer below',
      under: opaque,
      lower: gradient,
      upper: wash,
      blend: 'normal',
      opacity: 0.8,
      linear: true
    },
    { name: 'multiply over opaque', lower: opaque, upper: gradient, blend: 'multiply', opacity: 0.9 },
    { name: 'screen over opaque', lower: opaque, upper: gradient, blend: 'screen', opacity: 1 },
    { name: 'overlay over opaque', lower: opaque, upper: gradient, blend: 'overlay', opacity: 0.75 }
  ];
  const failures: string[] = [];
  for (const item of cases) {
    const error = await mergeError(item, !!item.linear);
    report(`${item.name}: max presented difference ${error} of 255`);
    if (error > 2) {
      failures.push(`${item.name}: ${error}`);
    }
  }

  if (failures.length) {
    throw new Error(`Merging a layer down changed the presented image (levels): ${failures.join('; ')}.`);
  }

  report('PASS: merged layers present the same image');
}

/** A tile fill: premultiplied RGBA8 for document pixel (x, y) of tile 0,0 or 1,0. */
type Fill = (x: number, y: number) => [number, number, number, number];

const opaque: Fill = (x, y) => [40 + (x % 200), 90, 160 - (y % 120), 255];
const gradient: Fill = (x, y) => premultiply([(x * 3) % 256, 200 - (y % 180), 60], Math.round((x * 255) / 511));
const wash: Fill = (x, y) => premultiply([220, 120, 40], 40 + ((x + y) % 160));

function premultiply([r, g, b]: [number, number, number], alpha: number): [number, number, number, number] {
  return [Math.round((r * alpha) / 255), Math.round((g * alpha) / 255), Math.round((b * alpha) / 255), alpha];
}

/**
 * Presents the stack before and after merging its top layer down, in linear light with `linear`; returns the largest
 * channel difference.
 */
async function mergeError(
  {
    under,
    lower,
    lowerBlend,
    upper,
    blend,
    opacity
  }: { under?: Fill; lower: Fill; lowerBlend?: BlendMode; upper: Fill; blend: BlendMode; opacity: number },
  linear: boolean
) {
  const document = createDocument();
  const add = (fill: Fill, keys: string[], properties: Partial<Pick<Layer, 'blend' | 'opacity'>> = {}) => {
    document.changeLayer({ type: 'add' });
    const id = document.active.id;
    document.changeLayer({ type: 'update', id, patch: properties });
    document.commit(keys.map((key) => ({ layerId: id, key, before: undefined, after: tile(fill, key) })));
  };
  if (under) {
    add(under, ['0,0', '1,0']);
  }

  // The lower layer lacks tile 1,0, so the merge also creates a tile from the upper layer alone.
  add(lower, ['0,0'], lowerBlend ? { blend: lowerBlend } : {});
  add(upper, ['0,0', '1,0'], { blend, opacity });
  document.changeLayer({ type: 'delete', id: document.layers[0]!.id });

  const before = await present(document.layers, linear);
  const upperLayer = document.active,
    lowerLayer = document.layers.at(-2)!;
  const merged = new Map<string, Uint8Array | undefined>();
  for (const [key, pixels] of upperLayer.tiles) {
    const base = lowerLayer.tiles.get(key);
    merged.set(
      key,
      mergeTilePixels(
        base && unpackTile(base),
        unpackTile(pixels),
        upperLayer.blend,
        upperLayer.opacity,
        undefined,
        linear
      )
    );
  }

  document.mergeDown(upperLayer.id, merged);
  const after = await present(document.layers, linear);
  let error = 0;
  for (let index = 0; index < before.length; index++) {
    error = Math.max(error, Math.abs(before[index]! - after[index]!));
  }

  return error;
}

function tile(fill: Fill, key: string) {
  const [tx] = key.split(',').map(Number);
  const pixels = new Uint8Array(256 * 256 * 4);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      pixels.set(fill(tx! * 256 + x, y), (y * 256 + x) * 4);
    }
  }

  return pixels;
}

/** Presents tiles 0,0 and 1,0 at 100%, in linear light with `linear`, and reads the frame back. */
async function present(layers: Layer[], linear: boolean) {
  const errors: string[] = [];
  const canvas = new OffscreenCanvas(512, 256);
  const renderer = await createPaintRenderer(canvas, (message) => errors.push(message));
  renderer.setLinearBlending(linear);
  try {
    const size = { width: 512, height: 256 };
    await renderer.render(layers, { x: 256, y: 128, zoom: 1, angle: 0, mirrored: false }, size, 1, true);
    const { data } = await renderer.readPresented(canvas);
    if (errors.length) {
      throw new Error(errors.join('\n'));
    }

    return data;
  } finally {
    renderer.destroy();
  }
}
