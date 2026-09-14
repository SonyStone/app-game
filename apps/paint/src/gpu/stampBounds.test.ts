import { expect, it } from 'vitest';
import type { Dab } from '../brush';
import { directStampBounds, stampBounds } from './stampBounds';

it('includes the fractional stamp fringe without recompositing the full tile', () => {
  expect(stampBounds([{ x: 100.25, y: 80.75, radius: 8.5, flow: 1 }], 0, 0)).toEqual({
    x: 90,
    y: 71,
    width: 20,
    height: 20
  });
});
it('clips large stamps across negative tile boundaries', () => {
  expect(stampBounds([{ x: -256, y: -256, radius: 256, flow: 1 }], -1, -1)).toEqual({
    x: 0,
    y: 0,
    width: 256,
    height: 256
  });
  expect(stampBounds([{ x: -255.75, y: -128, radius: 1, flow: 1 }], -2, -1)).toEqual({
    x: 254,
    y: 126,
    width: 2,
    height: 4
  });
});
it('covers separate dabs together and rejects empty or outside damage', () => {
  expect(
    stampBounds(
      [
        { x: 10, y: 20, radius: 2, flow: 1 },
        { x: 200, y: 210, radius: 3, flow: 1 }
      ],
      0,
      0
    )
  ).toEqual({ x: 7, y: 17, width: 197, height: 197 });
  expect(stampBounds([], 0, 0)).toBeUndefined();
  expect(stampBounds([{ x: 400, y: 400, radius: 1, flow: 1 }], 0, 0)).toBeUndefined();
});

it('skips tiles inside a large tip radius but outside the direct quad', () => {
  const dab = directDab(128, 128, 512, 16, 1, 0);
  expect(stampBounds([dab], 0, 1)).toBeDefined();
  expect(directStampBounds(dab, 0, 1)).toBeUndefined();
  expect(directStampBounds(dab, 0, 0)).toEqual({ x: 0, y: 111, width: 256, height: 34 });
});

it('rotates the direct footprint and clips it at signed tile boundaries', () => {
  const dab = directDab(-256, -128, 512, 16, 0, 1);
  expect(directStampBounds(dab, -2, -1)).toEqual({ x: 239, y: 0, width: 17, height: 256 });
  expect(directStampBounds(dab, -1, -1)).toEqual({ x: 0, y: 0, width: 17, height: 256 });
  expect(directStampBounds(dab, 0, -1)).toBeUndefined();
});

it('retains the raster fringe at fractional positions and arbitrary rotations', () => {
  for (const angle of [0.17, 0.73, 1.98, 2.82, 4.45, 5.61]) {
    const dab = directDab(-91.25, 32.75, 80, 20, Math.cos(angle), Math.sin(angle));
    const data = dab.abr!.data;
    // Each rendered corner and its rounding fringe must survive damage clipping.
    for (const u of [-1, 1]) for (const v of [-1, 1]) {
      const x = dab.x + u * data[2]! * data[4]! - v * data[3]! * data[5]!;
      const y = dab.y + u * data[2]! * data[5]! + v * data[3]! * data[4]!;
      for (const dx of [-0.5, 0.5]) for (const dy of [-0.5, 0.5]) {
        const tx = Math.floor((x + dx) / 256), ty = Math.floor((y + dy) / 256);
        const bounds = directStampBounds(dab, tx, ty)!;
        expect(bounds).toBeDefined();
        expect(x + dx - tx * 256).toBeGreaterThanOrEqual(bounds.x);
        expect(x + dx - tx * 256).toBeLessThan(bounds.x + bounds.width);
        expect(y + dy - ty * 256).toBeGreaterThanOrEqual(bounds.y);
        expect(y + dy - ty * 256).toBeLessThan(bounds.y + bounds.height);
      }
    }
  }
});

function directDab(x: number, y: number, width: number, height: number, cos: number, sin: number): Dab {
  return {
    x, y, radius: Math.hypot(width, height), flow: 1,
    abr: { data: new Float32Array([x, y, width, height, cos, sin, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1]), secondary: false }
  };
}
