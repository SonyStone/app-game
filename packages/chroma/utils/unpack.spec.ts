import { describe, expect, it } from 'vitest';
import { unpack } from './unpack';

describe('Testing unpack', () => {
  it('parse simple CMYK colors', () => {
    expect(unpack([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);

    expect(unpack([[1, 2, 3, 4]])).toEqual([1, 2, 3, 4]);

    expect(unpack([{ c: 1, m: 2, y: 3, k: 4 }], 'cmyk')).toEqual([1, 2, 3, 4]);

    expect(unpack([0, 1, 1, 1], 'cmyk')).toEqual([0, 1, 1, 1]);

    expect(unpack([{ r: 1, g: 2, b: 3, a: 4 }], 'rgba')).toEqual([1, 2, 3, 4]);
  });
});
