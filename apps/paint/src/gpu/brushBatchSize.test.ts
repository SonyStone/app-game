import { expect, it } from 'vitest';
import { adaptivePaintBatchSize, expandToRasterGrid } from './brushBatchSize';

it('bounds large brush batches by raster work at every LOD while retaining small-tip batching', () => {
  const dab = (size: number) => ({ x: 0, y: 0, radius: size / 2, flow: 1 });
  expect(adaptivePaintBatchSize([dab(9)])).toBe(256);
  const large = dab(222);
  expect(adaptivePaintBatchSize([large])).toBeLessThan(32);
  expect(adaptivePaintBatchSize([large], 8)).toBe(256);
  expect(adaptivePaintBatchSize([dab(9), dab(2048)])).toBe(1);
});

it('updates complete coarse pixels at partial-tile and batch boundaries', () => {
  expect(expandToRasterGrid({ x: 3, y: 5, width: 14, height: 10 }, 8))
    .toEqual({ x: 0, y: 0, width: 24, height: 16 });
  expect(expandToRasterGrid({ x: 250, y: 255, width: 6, height: 1 }, 8))
    .toEqual({ x: 248, y: 248, width: 8, height: 8 });
  const detailed = { x: 3, y: 5, width: 14, height: 10 };
  expect(expandToRasterGrid(detailed, 1)).toBe(detailed);
  expect(expandToRasterGrid(undefined, 8)).toBeUndefined();
});
