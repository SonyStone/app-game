import { describe, expect, it } from 'vitest';
import { createPoolAllocator, selectDetailGrid } from './detailTables';

describe('selectDetailGrid', () => {
  const square = (pixels: number) => ({ pixelsPerUnit: pixels, axisPixels: [pixels, pixels] as const });

  it('picks the smallest table that lets a pixel span four cells', () => {
    expect(selectDetailGrid(square(3), 0)).toEqual({ columns: 16, rows: 16 });
    expect(selectDetailGrid(square(25), 128)).toEqual({ columns: 128, rows: 128 });
    expect(selectDetailGrid(square(40), 0)).toEqual({ columns: 192, rows: 192 });
    expect(selectDetailGrid(square(300), 128)).toEqual({ columns: 1024, rows: 1024 });
  });

  it('sizes rows and columns by how far each axis of the outline is magnified', () => {
    expect(selectDetailGrid({ pixelsPerUnit: 40, axisPixels: [40, 20] }, 0)).toEqual({ columns: 192, rows: 96 });
  });

  it('sizes a window by the pixels it spans, however far the whole outline is magnified', () => {
    expect(selectDetailGrid(square(4000), 0, 0.05)).toEqual({ columns: 1024, rows: 1024 });
    expect(selectDetailGrid(square(4000), 0, 0.02)).toEqual({ columns: 384, rows: 384 });
    expect(selectDetailGrid(square(4000), 0)).toBeUndefined();
  });

  it('builds nothing when the prepared table is fine enough or no table would be trusted', () => {
    expect(selectDetailGrid(square(20), 128)).toBeUndefined();
    expect(selectDetailGrid(square(513), 0)).toBeUndefined();
  });
});

describe('createPoolAllocator', () => {
  it('allocates first fit, merges freed neighbours and reports exhaustion', () => {
    const pool = createPoolAllocator(10);

    expect(pool.allocate(4)).toBe(0);
    expect(pool.allocate(4)).toBe(4);
    expect(pool.allocate(4)).toBeUndefined();

    pool.free(0, 4);
    pool.free(4, 4);

    expect(pool.allocate(10)).toBe(0);
  });

  it('reuses a freed gap before the tail', () => {
    const pool = createPoolAllocator(12);
    pool.allocate(4);
    pool.allocate(4);
    pool.free(0, 4);

    expect(pool.allocate(3)).toBe(0);
    expect(pool.allocate(4)).toBe(8);
  });
});
