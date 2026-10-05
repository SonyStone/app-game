import { expect, it } from 'vitest';
import { encodeRowTable, rowTableUnits } from './outlineTable';

it('packs running row coverage into 16-bit halves, even cells low', () => {
  const size = 4;
  const coverage = new Float32Array([0, 0.5, 1, 0.25, 1, 1, 1, 1, 0, 0, 0, 0, 0.1, 0.2, 0.3, 0.4]);
  const words = encodeRowTable(coverage, { columns: size, rows: size });
  const units = rowTableUnits(size);
  const value = (row: number, cell: number) => {
    const index = row * size + cell;
    return (words[index >> 1]! >>> ((index & 1) * 16)) & 0xffff;
  };

  expect(words).toHaveLength(8);
  expect([0, 1, 2, 3].map((cell) => value(0, cell))).toEqual(
    [0, 0.5, 1.5, 1.75].map((running) => Math.round(running * units))
  );
  expect(value(1, 3)).toBe(4 * units);
  expect(value(2, 3)).toBe(0);
  expect(value(3, 3)).toBe(Math.round(1 * units));
});

it('keeps a full row of the largest table within 16 bits', () => {
  expect(1024 * rowTableUnits(1024)).toBeLessThanOrEqual(0xffff);
  expect(rowTableUnits(256)).toBe(255);
});
