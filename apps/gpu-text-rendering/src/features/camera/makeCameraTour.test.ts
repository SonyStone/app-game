import { expect, it, vi } from 'vitest';
import type { TextDocument } from '../document/document';
import { makeCameraTour } from './makeCameraTour';

it('returns new cameras along a leg that starts from the camera passed when it begins', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const tour = makeCameraTour();
  const start = { x: 0, y: 0, zoom: 1, rotation: 0.5 };
  const document = {
    pages: [{ x: 0, y: 0, width: 612, height: 792, beginVertex: 0, endVertex: 6 }],
    positions: { x: new Float32Array([0.25]), y: new Float32Array([0.75]) }
  } as unknown as TextDocument;

  const first = tour.update(1000, document, start);
  expect(first).toEqual(start);
  expect(first).not.toBe(start);
  const middle = tour.update(8000, document, { ...first, x: 99 });
  expect(middle.x).toBeCloseTo(0.125);
  expect(middle.rotation).toBe(0.5);
  const end = tour.update(15000, document, middle);
  expect(end).toMatchObject({ x: 0.25, y: 0.25 });
  expect(end.zoom).toBeCloseTo(1 / 128);

  tour.stop();
  expect(tour.update(15001, document, { ...end, x: 5 }).x).toBe(5);
  vi.restoreAllMocks();
});
