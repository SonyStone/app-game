import { expect, it } from 'vitest';
import { planCanvasPickup } from './canvasPickup';

it('captures negative coordinates and exact tile boundaries without including extra source tiles', () => {
  expect(planCanvasPickup({ x: -256, y: -128, width: 256, height: 128 }, 1024)).toEqual({
    minX: -1,
    maxX: -1,
    minY: -1,
    maxY: -1,
    width: 256,
    height: 128
  });
  expect(planCanvasPickup({ x: -0.5, y: 0, width: 1, height: 256 }, 1024)).toMatchObject({
    minX: -1,
    maxX: 0,
    minY: 0,
    maxY: 0
  });
});

it('bounds patch memory and source traversal for large brushes', () => {
  const plan = planCanvasPickup({ x: 0, y: 0, width: 5000, height: 5000 }, 1024);
  expect(plan.width * plan.height * 4 * 3).toBe(12 * 1024 * 1024);
  expect(() => planCanvasPickup({ x: 0, y: 0, width: 1e8, height: 1e8 }, 1024)).toThrow('source-tile budget');
  expect(() => planCanvasPickup({ x: 0, y: 0, width: 64, height: 64 }, 8192)).toThrow('maxDimension');
  expect(() => planCanvasPickup({ x: Infinity, y: 0, width: 64, height: 64 }, 1024)).toThrow('finite');
  expect(() => planCanvasPickup({ x: 0, y: 0, width: 0, height: 64 }, 1024)).toThrow('positive');
});

it('keeps an exact pixel pick at one texel rather than magnifying neighbouring pixels', () => {
  expect(planCanvasPickup({ x: 127, y: -1, width: 1, height: 1 }, 1024)).toEqual({
    minX: 0,
    maxX: 0,
    minY: -1,
    maxY: -1,
    width: 1,
    height: 1
  });
});

it('preserves one-texel filter halos without bucket resampling or silent minification', () => {
  expect(planCanvasPickup({ x: -257, y: -1, width: 258, height: 258 }, 1024, true)).toMatchObject({
    minX: -2,
    maxX: 0,
    minY: -1,
    maxY: 1,
    width: 258,
    height: 258
  });
  expect(() => planCanvasPickup({ x: 0.5, y: 0, width: 258, height: 258 }, 1024, true)).toThrow('integer');
  expect(() => planCanvasPickup({ x: 0, y: 0, width: 2048, height: 2048 }, 1024, true)).toThrow('maxDimension');
});
