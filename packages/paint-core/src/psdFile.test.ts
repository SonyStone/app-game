import { readPsd } from '@app-game/psd';
import { openPsd } from '@app-game/psd/viewer';
import { expect, it } from 'vitest';
import type { Layer } from './document';
import { imageTiles } from './imageTiles';
import { isPsdFile, readPsdFile, writePsdFile } from './psdFile';
import { unpackTile } from './tilePixels';

const read = async (data: unknown) => data as Uint8Array;

/** A layer of one straight-alpha color filling `width` × `height` at (`left`, `top`). */
function solidLayer(id: string, color: number[], left: number, top: number, width: number, height: number): Layer {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels.set(color, index);
  }

  return {
    id,
    name: id,
    visible: true,
    opacity: 1,
    blend: 'normal',
    tiles: imageTiles(pixels, width, height, left, top)
  };
}

it('exports the drawn bounds with each layer cropped to its pixels and a flattened image', async () => {
  const paper = solidLayer('Paper', [255, 255, 255, 255], -10, -10, 300, 20);
  const ink = { ...solidLayer('Ink', [0, 0, 255, 128], 250, 0, 40, 30), blend: 'multiply' as const, alphaLock: true };
  const hidden = { ...solidLayer('Hidden', [255, 0, 0, 255], 0, 0, 5, 5), visible: false, clipping: true };
  const psd = await readPsd(new Uint8Array(await (await writePsdFile([paper, ink, hidden], read)).arrayBuffer()));

  expect(psd).toMatchObject({ width: 300, height: 40 });
  expect(psd.layers.map(({ name, left, top, width, height }) => [name, left, top, width, height])).toEqual([
    ['Paper', 0, 0, 300, 20],
    ['Ink', 260, 10, 40, 30],
    ['Hidden', 10, 10, 5, 5]
  ]);
  expect(psd.layers[0]!.blend).toBe('normal');
  expect(psd.layers[1]).toMatchObject({ blend: 'multiply', transparencyLocked: true });
  expect([...psd.layers[1]!.pixels.subarray(0, 4)]).toEqual([0, 0, 255, 128]);
  expect(psd.layers[2]).toMatchObject({ visible: false, clipping: true });
});

it('exports a region and refuses an empty drawing', async () => {
  const paper = solidLayer('Paper', [10, 20, 30, 255], 0, 0, 100, 100);
  const psd = await readPsd(
    new Uint8Array(
      await (await writePsdFile([paper], read, { left: 90, top: 90, width: 20, height: 20 })).arrayBuffer()
    )
  );

  expect(psd.layers[0]).toMatchObject({ left: 0, top: 0, width: 10, height: 10 });
  await expect(writePsdFile([{ ...paper, tiles: new Map() }], read)).rejects.toThrow('nothing to export');
});

// Two 513x514 strict renders plus the export exceed the 5 s default on shared CI runners.
it.each([false, true])('preserves the whole strict composite across 512-pixel edges with linear blending %s', async (linearBlending) => {
  // An opaque base keeps the saved composite's white-matte round trip lossless.
  const layers = [
    solidLayer('Base', [37, 89, 173, 255], -3, 7, 513, 514),
    { ...solidLayer('Multiply', [197, 71, 43, 191], 490, 500, 40, 40), blend: 'multiply' as const, opacity: 0.33333 },
    { ...solidLayer('Clipped', [71, 163, 211, 127], -1, 508, 530, 20), blend: 'screen' as const, clipping: true },
    { ...solidLayer('Hidden', [255, 0, 0, 255], -3, 7, 513, 514), visible: false }
  ];
  const file = await writePsdFile(layers, read, { left: -3, top: 7, width: 513, height: 514 }, linearBlending);
  const opened = await openPsd(await file.arrayBuffer());
  if (!opened.ok) {
    throw new Error(opened.error.message);
  }

  const document = opened.value;
  try {
    const whole = document.render({
      linearBlending, approximate: false, textGamma: 1.45, vectorPaths: false, typeLayers: false, smartObjects: null
    });
    const saved = document.merged();
    if (!whole.ok || !saved.ok) {
      throw new Error('The exported stack and its saved composite must both render.');
    }

    try {
      expect(whole.value.approximations).toEqual([]);
      expect(saved.value.pixels).toEqual(whole.value.pixels);
    } finally {
      whole.value.dispose();
    }
  } finally {
    document.close();
  }
}, 60_000);

it('opens an exported PSD as a drawing with its layers and settings', async () => {
  const paper = solidLayer('Paper', [255, 255, 255, 255], 0, 0, 200, 100);
  const ink = { ...solidLayer('Ink', [255, 0, 0, 128], 20, 30, 10, 10), clipping: true, opacity: 0.5 };
  const file = await writePsdFile([paper, ink], read);

  expect(await isPsdFile(file)).toBe(true);
  expect(await isPsdFile(new Blob(['PAINT3']))).toBe(false);
  const drawing = await readPsdFile(file, { width: 100, height: 100 });
  expect(drawing.layers.map(({ name, blend, clipping }) => [name, blend, !!clipping])).toEqual([
    ['Paper', 'normal', false],
    ['Ink', 'normal', true]
  ]);
  expect(drawing.layers[1]!.opacity).toBeCloseTo(0.5, 2);
  expect(drawing.activeId).toBe(drawing.layers[1]!.id);
  expect(drawing.camera).toMatchObject({ x: 100, y: 50, zoom: 0.45 });
  const tile = unpackTile(drawing.layers[1]!.tiles.get('0,0')!);
  const at = (30 * 256 + 20) * 4;
  expect([...tile.subarray(at, at + 4)]).toEqual([128, 0, 0, 128]);
});
