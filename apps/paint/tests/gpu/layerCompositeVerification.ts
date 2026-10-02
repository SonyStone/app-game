import type { BlendMode, Layer } from '@app-game/paint-core/document';
import { createPaintRenderer } from '@app-game/paint-core/gpu/renderer';

/**
 * Compares stacks of uniform translucent layers, composed by the renderer and presented on the canvas, with the
 * composite formulas evaluated in double precision. With 8-bit composition textures, 40 glazes at 3% drifted by 7
 * levels; float composition keeps every channel within 2 of the exact value. Also reports the time to recompose a
 * 40-layer viewport.
 */
export async function verifyLayerComposite(report: (message: string) => void) {
  const stacks: { name: string; base: Rgb; layers: { color: Rgb; alpha: number; opacity: number; blend: BlendMode }[] }[] = [
    {
      name: '40 glazes at 3% (normal)',
      base: [30, 40, 60],
      layers: repeat(40, { color: [230, 180, 90], alpha: 255, opacity: 0.03, blend: 'normal' })
    },
    {
      name: '40 glazes at 3% (smooth color)',
      base: [30, 40, 60],
      layers: repeat(40, { color: [230, 180, 90], alpha: 255, opacity: 0.03, blend: 'linear' })
    },
    {
      name: '20 dark washes, 5% tile alpha (smooth color)',
      base: [250, 248, 240],
      layers: repeat(20, { color: [20, 30, 70], alpha: 13, opacity: 1, blend: 'linear' })
    },
    {
      name: '12 multiply layers at 40%',
      base: [240, 230, 210],
      layers: repeat(12, { color: [200, 210, 230], alpha: 255, opacity: 0.4, blend: 'multiply' })
    }
  ];
  let worst = 0;
  for (const stack of stacks) {
    const layers: Layer[] = [
      layer('base', stack.base, 255, 1, 'normal'),
      ...stack.layers.map((item, index) => layer(`layer-${index}`, item.color, item.alpha, item.opacity, item.blend))
    ];
    const actual = await renderCenter(layers);
    const expected = composeReference(layers);
    const error = Math.max(...actual.map((value, channel) => Math.abs(value - expected[channel]!)));
    worst = Math.max(worst, error);
    report(
      `${stack.name}: rendered ${actual.join(',')}, exact ${expected.map((value) => value.toFixed(1)).join(',')}, max error ${error.toFixed(1)}`
    );
  }

  report(`Largest channel error: ${worst.toFixed(1)} of 255`);
  report(`40-layer 1024×1024 recomposition: ${(await recomposeMs()).toFixed(2)} ms per frame`);
  if (worst > 2) {
    throw new Error(`Layer composition drifted ${worst.toFixed(1)} levels from the exact result.`);
  }
}

/** Median GPU-inclusive time to recompose a 1024×1024 view of 40 translucent layers over 16 tiles each. */
async function recomposeMs() {
  const tiles = (color: Rgb, alpha: number) => {
    const source = layer('', color, alpha, 1, 'normal').tiles.get('0,0')!;
    return new Map(Array.from({ length: 16 }, (_, index) => [`${index % 4},${Math.floor(index / 4)}`, source]));
  };
  const layers: Layer[] = [
    { id: 'base', name: 'base', visible: true, opacity: 1, blend: 'normal', tiles: tiles([30, 40, 60], 255) },
    ...Array.from({ length: 40 }, (_, index) => ({
      id: `layer-${index}`,
      name: `layer-${index}`,
      visible: true,
      opacity: 0.5,
      blend: 'linear' as const,
      tiles: tiles([230, 180, 90], 128)
    }))
  ];
  const renderer = await createPaintRenderer(new OffscreenCanvas(1024, 1024), () => {}, { cacheTiles: 1024 });
  try {
    const camera = { x: 512, y: 512, zoom: 1, angle: 0, mirrored: false };
    const size = { width: 1024, height: 1024 };
    await renderer.render(layers, camera, size, 1);
    await renderer.submitted();
    const times: number[] = [];
    for (let frame = 0; frame < 15; frame++) {
      renderer.invalidateView();
      const start = performance.now();
      await renderer.render(layers, camera, size, 1);
      await renderer.submitted();
      times.push(performance.now() - start);
    }

    return times.sort((a, b) => a - b)[7]!;
  } finally {
    renderer.destroy();
  }
}

type Rgb = [number, number, number];

function repeat<T>(count: number, value: T): T[] {
  return Array.from({ length: count }, () => value);
}

/** A layer whose tile 0,0 is one uniform premultiplied color. */
function layer(id: string, color: Rgb, alpha: number, opacity: number, blend: BlendMode): Layer {
  const pixels = new Uint8Array(256 * 256 * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = Math.round((color[0] * alpha) / 255);
    pixels[offset + 1] = Math.round((color[1] * alpha) / 255);
    pixels[offset + 2] = Math.round((color[2] * alpha) / 255);
    pixels[offset + 3] = alpha;
  }

  return { id, name: id, visible: true, opacity, blend, tiles: new Map([['0,0', pixels]]) };
}

/** Renders the stack centered on tile 0,0 and returns the presented center pixel. */
async function renderCenter(layers: Layer[]): Promise<number[]> {
  const errors: string[] = [];
  const canvas = new OffscreenCanvas(64, 64);
  const renderer = await createPaintRenderer(canvas, (message) => errors.push(message));
  try {
    await renderer.render(layers, { x: 128, y: 128, zoom: 1, angle: 0, mirrored: false }, { width: 64, height: 64 }, 1, true);
    await renderer.submitted();
    const bitmap = await createImageBitmap(await canvas.convertToBlob());
    const copy = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!;
    copy.drawImage(bitmap, 0, 0);
    if (errors.length) {
      throw new Error(errors.join('\n'));
    }

    return [...copy.getImageData(32, 32, 1, 1).data.slice(0, 3)];
  } finally {
    renderer.destroy();
  }
}

/** The composite shader's formulas in double precision, over an opaque first layer. */
function composeReference(layers: Layer[]): number[] {
  let base = [0, 0, 0, 0];
  for (const item of layers) {
    const pixels = item.tiles.get('0,0') as Uint8Array;
    const source = [...pixels.slice(0, 4)].map((value) => value / 255);
    base = item.blend === 'linear' ? linearSourceOver(base, source.map((value) => value * item.opacity)) : composite(base, source, item.opacity, item.blend);
  }

  return base.slice(0, 3).map((value) => value * 255);
}

function composite(base: number[], source: number[], opacity: number, blend: BlendMode) {
  const alpha = source[3]! * opacity;
  const cb = base.slice(0, 3).map((value) => value / Math.max(base[3]!, 1e-6));
  const cs = source.slice(0, 3).map((value) => value / Math.max(source[3]!, 1e-6));
  const mixed = cs.map((s, channel) => {
    const b = cb[channel]!;
    if (blend === 'multiply') {
      return b * s;
    }

    if (blend === 'screen') {
      return 1 - (1 - b) * (1 - s);
    }

    if (blend === 'overlay') {
      return b > 0.5 ? 1 - 2 * (1 - b) * (1 - s) : 2 * b * s;
    }

    return s;
  });
  const rgb = mixed.map((m, channel) => base[channel]! * (1 - alpha) + (cs[channel]! * (1 - base[3]!) + m * base[3]!) * alpha);
  return [...rgb, alpha + base[3]! * (1 - alpha)];
}

function linearSourceOver(base: number[], source: number[]) {
  if (source[3]! <= 0) {
    return base;
  }

  if (base[3]! <= 0 || source[3]! >= 1) {
    return source;
  }

  const alpha = source[3]! + base[3]! * (1 - source[3]!);
  const rgb = [0, 1, 2].map((channel) => {
    const b = decode(Math.min(1, base[channel]! / base[3]!));
    const s = decode(Math.min(1, source[channel]! / source[3]!));
    return encode((s * source[3]! + b * base[3]! * (1 - source[3]!)) / alpha) * alpha;
  });
  return [...rgb, alpha];
}

function decode(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function encode(value: number) {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}
