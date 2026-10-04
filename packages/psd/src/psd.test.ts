import { expect, it } from 'vitest';
import { packBits, unpackBits } from './packBits';
import type { PsdLayer } from './psd';
import { readPsd } from './readPsd';
import { writePsd } from './writePsd';

it('packs runs and literals and unpacks them back', () => {
  const row = Uint8Array.from([1, 1, 1, 1, 2, 3, 4, 5, 5, ...Array(300).fill(9), 7]);
  const packed = packBits(row);
  expect(packed.length).toBeLessThan(row.length / 4);
  expect(unpackBits(packed, row.length)).toEqual(row);
  const noise = Uint8Array.from({ length: 1000 }, (_, index) => (index * 37) % 251);
  expect(unpackBits(packBits(noise), noise.length)).toEqual(noise);
  expect(() => unpackBits(Uint8Array.from([5, 1]), 6)).toThrow('corrupt');
});

it('writes layers that read back with their pixels, placement and settings', () => {
  const layer = (name: string, patch: Partial<PsdLayer>): PsdLayer => ({
    name,
    left: 0,
    top: 0,
    width: 3,
    height: 2,
    pixels: Uint8Array.from({ length: 24 }, (_, index) => (index * 11) % 256),
    opacity: 1,
    visible: true,
    blend: 'normal',
    clipping: false,
    transparencyLocked: false,
    ...patch
  });
  const layers = [
    layer('Paper', {}),
    layer('Тени — ink', { left: -1, top: 4, opacity: 0.5, blend: 'multiply', clipping: true }),
    layer('Hidden', { visible: false, transparencyLocked: true, blend: 'screen' }),
    layer('Empty', { width: 0, height: 0, pixels: new Uint8Array(0) })
  ];
  const composite = new Uint8Array(10 * 8 * 4).fill(200);
  const file = writePsd({ width: 10, height: 8, layers }, composite);
  expect(new TextDecoder().decode(file.subarray(0, 4))).toBe('8BPS');

  const read = readPsd(file);
  expect(read.width).toBe(10);
  expect(read.height).toBe(8);
  expect(read.layers.map(({ name }) => name)).toEqual(['Paper', 'Тени — ink', 'Hidden', 'Empty']);
  expect(read.layers[0]!.pixels).toEqual(layers[0]!.pixels);
  expect(read.layers[1]).toMatchObject({ left: -1, top: 4, blend: 'multiply', clipping: true });
  expect(read.layers[1]!.opacity).toBeCloseTo(0.5, 2);
  expect(read.layers[2]).toMatchObject({ visible: false, transparencyLocked: true, blend: 'screen' });
  expect(read.layers[3]).toMatchObject({ width: 0, height: 0 });
});

it('refuses other formats and canvases too large for a PSD', () => {
  expect(() => readPsd(new Uint8Array(40))).toThrow('not a Photoshop document');
  const header = Uint8Array.from([56, 66, 80, 83, 0, 1, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 1, 0, 0, 0, 1, 0, 16, 0, 3]);
  expect(() => readPsd(header)).toThrow('8-bit RGB');
  expect(() => writePsd({ width: 40000, height: 1, layers: [] }, new Uint8Array(0))).toThrow('30000');
});
