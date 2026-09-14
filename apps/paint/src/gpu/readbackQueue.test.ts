import { expect, it } from 'vitest';
import { readbackLayout } from './readbackQueue';

it('copies compact LOD masks without allocating full-tile staging ranges', () => {
  const layout = readbackLayout([256, 32, 32]);
  expect(layout).toEqual({
    items: [
      { offset: 0, bytesPerRow: 1024 },
      { offset: 262144, bytesPerRow: 256 },
      { offset: 270336, bytesPerRow: 256 }
    ],
    bytes: 278528
  });
  expect(layout.bytes).toBeLessThan(3 * 256 * 256 * 4 / 2);
});

it('keeps mixed readback rows aligned and rejects invalid sizes', () => {
  const layout = readbackLayout([128, 256, 16]);
  for (const item of layout.items) {
    expect(item.offset % 256).toBe(0);
    expect(item.bytesPerRow % 256).toBe(0);
  }
  for (const invalid of [0, -1, 257, 1.5, NaN]) expect(() => readbackLayout([invalid])).toThrow();
});
