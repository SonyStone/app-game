import { describe, expect, it } from 'vitest';
import { FMat3, Mat3 } from './m3';

describe('m3', () => {
  it('should create new Float Mat3', () => {
    const identity = new FMat3().identity();

    expect(identity).toEqual(new FMat3().copy([1, 0, 0, 0, 1, 0, 0, 0, 1]));
  });
  it('should identity', () => {
    const identity = new Mat3().identity();

    expect(identity).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
});
