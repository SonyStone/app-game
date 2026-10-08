import { expect, it } from 'vitest';
import { readPsd, writePsd, type PsdLayer } from './index';

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

it('writes layers that read back with their pixels, placement and settings', async () => {
  const layers = [
    layer('Paper', {}),
    layer('Тени — ink 😀', { left: -1, top: 4, opacity: 0.5, fill: 0.25, blend: 'multiply', clipping: true }),
    layer('Hidden', { visible: false, transparencyLocked: true, blend: 'softLight' }),
    layer('Empty', { width: 0, height: 0, pixels: new Uint8Array(0) })
  ];
  const composite = new Uint8Array(10 * 8 * 4).fill(200);
  const file = await writePsd({ width: 10, height: 8, layers }, composite);
  expect(new TextDecoder().decode(file.subarray(0, 4))).toBe('8BPS');

  const read = await readPsd(file);
  expect(read.width).toBe(10);
  expect(read.height).toBe(8);
  expect(read.layers.map(({ name }) => name)).toEqual(['Paper', 'Тени — ink 😀', 'Hidden', 'Empty']);
  expect(read.layers[0]!.pixels).toEqual(layers[0]!.pixels);
  expect(read.layers[1]).toMatchObject({ left: -1, top: 4, blend: 'multiply', clipping: true });
  expect(read.layers[1]!.opacity).toBeCloseTo(0.5, 2);
  expect(read.layers[1]!.fill).toBeCloseTo(0.25, 2);
  expect(read.layers[2]).toMatchObject({ visible: false, transparencyLocked: true, blend: 'softLight' });
  expect(read.layers[3]).toMatchObject({ width: 0, height: 0 });
});

it('writes canvases over 30000 pixels as PSB', async () => {
  const file = await writePsd({ width: 30001, height: 1, layers: [layer('A', {})] }, new Uint8Array(30001 * 4));
  expect(file[5]).toBe(2);
  expect((await readPsd(file)).layers[0]!.pixels).toEqual(layer('A', {}).pixels);
});

it('reads the other color modes as one sRGB layer of their flattened image', async () => {
  // A 1×1 CMYK header, three empty sections and a raw image of unprinted paper (CMYK is stored inverted).
  const cmyk = Uint8Array.from([56, 66, 80, 83, 0, 1, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 1, 0, 0, 0, 1, 0, 8, 0, 4, ...Array(14).fill(0), 255, 255, 255, 255]);
  const read = await readPsd(cmyk);
  expect(read).toMatchObject({ width: 1, height: 1 });
  expect(read.layers).toHaveLength(1);
  expect(read.layers[0]!.pixels[3]).toBe(255);
});

it('refuses other formats and canvases too large for a PSB', async () => {
  await expect(readPsd(new Uint8Array(40))).rejects.toThrow('not a Photoshop document');
  await expect(writePsd({ width: 400000, height: 1, layers: [] }, new Uint8Array(0))).rejects.toThrow('300000');
});
