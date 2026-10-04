import type { DocumentEditContext } from '@app-game/paint-core/composition/documentEdit';
import type { Layer } from '@app-game/paint-core/document';
import { expect, it } from 'vitest';
import { gradientEdit, gradientPosition, type GradientCommand } from './gradientEdit';

const base: GradientCommand = {
  start: { x: 0, y: 0 },
  end: { x: 100, y: 0 },
  kind: 'linear',
  repeat: 'none',
  stops: [
    { position: 0, color: '#ff0000', alpha: 1 },
    { position: 1, color: '#0000ff', alpha: 1 }
  ],
  opacity: 1,
  mixing: 'linear',
  area: { left: 0, top: 0, width: 100, height: 10 }
};

it('runs from the start color to the end color, brighter in the middle with Smooth color than Classic', async () => {
  const smooth = await run(base);
  // Pixel centers lie half a pixel inside the ends; in linear light even 0.5% of blue shows as 16 of 255.
  near(pixel(smooth, 0, 5), [255, 0, 16, 255]);
  near(pixel(smooth, 99, 5), [16, 0, 255, 255]);
  const classic = await run({ ...base, mixing: 'classic' });
  // Halfway: linear light keeps about 73% of each channel, encoded sRGB only half.
  expect(pixel(smooth, 50, 5)[0]).toBeGreaterThan(175);
  expect(pixel(classic, 50, 5)[0]).toBeLessThan(135);
  expect(pixel(smooth, 50, 5)[3]).toBe(255);
});

it('places points along each shape and repeats or reflects past the end', () => {
  const drag = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, repeat: 'none' as const };
  const at = (kind: GradientCommand['kind'], x: number, y: number, repeat: GradientCommand['repeat'] = 'none') =>
    gradientPosition({ ...drag, kind, repeat }, x, y);

  expect(at('linear', 5, 7)).toBeCloseTo(0.5);
  expect(at('linear', -5, 0)).toBe(0);
  expect(at('radial', 0, 5)).toBeCloseTo(0.5);
  // Angle: clockwise on screen (y down) from the drag's direction, a quarter at a time.
  expect(at('angle', 5, 0)).toBeCloseTo(0);
  expect(at('angle', 0, 5)).toBeCloseTo(0.25);
  expect(at('angle', -5, 0)).toBeCloseTo(0.5);
  expect(at('angle', 0, -5)).toBeCloseTo(0.75);
  // Diamond: a square with its corners on the axes of the drag.
  expect(at('diamond', 10, 0)).toBeCloseTo(1);
  expect(at('diamond', 2.5, 2.5)).toBeCloseTo(0.5);
  expect(at('diamond', 0, -10)).toBeCloseTo(1);

  expect(at('linear', 13, 0)).toBe(1);
  expect(at('linear', 13, 0, 'repeat')).toBeCloseTo(0.3);
  expect(at('linear', -3, 0, 'repeat')).toBeCloseTo(0.7);
  expect(at('linear', 13, 0, 'reflect')).toBeCloseTo(0.7);
  expect(at('linear', 23, 0, 'reflect')).toBeCloseTo(0.3);
  expect(at('linear', -3, 0, 'reflect')).toBeCloseTo(0.3);
  expect(at('radial', 0, 15, 'reflect')).toBeCloseTo(0.5);
});

it('draws repeated gradients in stripes', async () => {
  const stripes = await run({ ...base, end: { x: 25, y: 0 }, repeat: 'repeat' });
  // Each 25 px starts over: just before 25 it is blue, just after it red again.
  expect(pixel(stripes, 24, 5)[2]).toBeGreaterThan(200);
  expect(pixel(stripes, 25, 5)[0]).toBeGreaterThan(200);
  const mirrored = await run({ ...base, end: { x: 25, y: 0 }, repeat: 'reflect' });
  near(pixel(mirrored, 20, 5), pixel(mirrored, 29, 5));
});

it('fades out to transparent, spreads radially and lays its opacity over the paint', async () => {
  const faded = await run({
    ...base,
    stops: [
      { position: 0, color: '#ff0000', alpha: 1 },
      { position: 1, color: '#ff0000', alpha: 0 }
    ]
  });
  expect(pixel(faded, 99, 0)[3]).toBeLessThan(6);
  expect(pixel(faded, 50, 0)[3]).toBeGreaterThan(120);
  // Unpremultiplied, the fading pixels keep the start color.
  const [r, , , a] = pixel(faded, 50, 0);
  expect(r / a).toBeGreaterThan(0.95);

  const radial = await run({ ...base, kind: 'radial', start: { x: 50, y: 5 }, end: { x: 90, y: 5 } });
  expect(pixel(radial, 50, 5)[0]).toBeGreaterThan(250);
  // Pixel centers 10.5 and 89.5 lie equally far from the center at 50.
  near(pixel(radial, 10, 5), pixel(radial, 89, 5));

  const green = layer(new Uint8Array(256 * 256 * 4).map((_, index) => (index % 4 === 1 || index % 4 === 3 ? 255 : 0)));
  const half = await run(
    {
      ...base,
      stops: [
        { position: 0, color: '#ff0000', alpha: 1 },
        { position: 1, color: '#ff0000', alpha: 1 }
      ],
      opacity: 0.5,
      mixing: 'classic'
    },
    green
  );
  near(pixel(half, 10, 5), [128, 128, 0, 255]);
});

it('runs through every color stop, in order of position', async () => {
  const stops = await run({
    ...base,
    stops: [
      { position: 1, color: '#0000ff', alpha: 1 },
      { position: 0.5, color: '#00ff00', alpha: 1 },
      { position: 0, color: '#ff0000', alpha: 1 }
    ]
  });
  // Half a pixel past the green stop, in linear light a trace of blue shows.
  const [red, green, blue] = pixel(stops, 50, 5);
  expect([red < 5, green > 250, blue < 30]).toEqual([true, true, true]);
  expect(pixel(stops, 25, 5)[0]).toBeGreaterThan(150);
  expect(pixel(stops, 75, 5)[2]).toBeGreaterThan(150);
});

it('keeps locked transparency, stays inside the selection and refuses areas larger than its limit', async () => {
  const pixels = new Uint8Array(256 * 256 * 4);
  pixels.set([0, 255, 0, 255], (5 * 256 + 10) * 4);
  const locked = await run(base, { ...layer(pixels), alphaLock: true });
  const [red, green, , alpha] = pixel(locked, 10, 5);
  expect([red > 200, green, alpha]).toEqual([true, 0, 255]);
  expect(pixel(locked, 11, 5)).toEqual([0, 0, 0, 0]);

  const selected = await run({
    ...base,
    points: [
      { x: 20, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 10 },
      { x: 20, y: 10 }
    ]
  });
  expect(pixel(selected, 19, 5)).toEqual([0, 0, 0, 0]);
  expect(pixel(selected, 20, 5)[3]).toBe(255);
  expect(pixel(selected, 29, 5)[3]).toBe(255);
  expect(pixel(selected, 30, 5)).toEqual([0, 0, 0, 0]);

  await expect(run({ ...base, area: { left: 0, top: 0, width: 5000, height: 10 } })).rejects.toThrow('too large');
});

/** Channels within one 8-bit step of `expected`, which dithering allows. */
function near(actual: number[], expected: number[]) {
  actual.forEach((channel, index) => expect(Math.abs(channel - expected[index]!)).toBeLessThanOrEqual(1));
}

function layer(pixels?: Uint8Array, tiles = new Map<string, Uint8Array>()): Layer {
  if (pixels) {
    tiles.set('0,0', pixels);
  }

  return { id: 'layer', name: 'Layer', visible: true, opacity: 1, blend: 'normal', tiles };
}

async function run(command: GradientCommand, target = layer()) {
  const context: DocumentEditContext = {
    layers: [target],
    active: target,
    readTile: async (pixels) => pixels as Uint8Array,
    linearBlending: false,
    state: { get: () => undefined, set: () => {} },
    floating: { show: () => {}, move: () => {}, clear: async () => {} }
  };
  return gradientEdit.run(context, command);
}

function pixel(result: Awaited<ReturnType<typeof run>>, x: number, y: number): [number, number, number, number] {
  const tile = result.changes.find((change) => change.key === '0,0')?.after as Uint8Array | undefined;
  const index = (y * 256 + x) * 4;
  return tile ? [tile[index]!, tile[index + 1]!, tile[index + 2]!, tile[index + 3]!] : [0, 0, 0, 0];
}
