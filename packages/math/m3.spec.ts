import { describe, expect, it } from 'vitest';
import { m3 } from '.';

describe('m3', () => {
  it('should identity Mat3', () => {
    const identity = m3.identity([]);

    expect(identity).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('should identity Mat3 Float32Array', () => {
    const identity = m3.identity(new Float32Array(9));

    expect(identity).toEqual(m3.set(new Float32Array(9), 1, 0, 0, 0, 1, 0, 0, 0, 1));
  });
});
