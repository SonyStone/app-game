import { describe, expect, it } from 'vitest';
import { paintRuns } from './paintRuns';

describe('paintRuns', () => {
  it('preserves image/vector overlap and batches only adjacent compatible instances', () => {
    const buffer = new ArrayBuffer(8 * 80);
    const records = new DataView(buffer);

    for (const [index, image] of [
      [2, 0],
      [3, 0],
      [4, 1],
      [6, 0]
    ] as const) {
      records.setUint32(index * 80 + 64, image, true);
      records.setUint32(index * 80 + 72, 2, true);
    }

    expect(paintRuns(buffer, 1, 7)).toEqual([
      { first: 1, count: 1, image: undefined, blend: 0 },
      { first: 2, count: 2, image: 0, blend: 0 },
      { first: 4, count: 1, image: 1, blend: 0 },
      { first: 5, count: 1, image: undefined, blend: 0 },
      { first: 6, count: 1, image: 0, blend: 0 }
    ]);
    expect(paintRuns(buffer, 7, 7)).toEqual([]);
    const modes = new Uint8Array(8);
    modes[3] = 1;
    expect(paintRuns(buffer, 2, 4, modes.buffer)).toEqual([
      { first: 2, count: 1, image: 0, blend: 0 },
      { first: 3, count: 1, image: 0, blend: 1 }
    ]);
  });
});
