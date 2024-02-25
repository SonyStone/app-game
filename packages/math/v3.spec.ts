import { describe, expect, it } from 'vitest';
import { FVec3, IVec3 } from './v3';

describe('v3', () => {
  it('should create new Vec3', () => {
    const vec = FVec3.create(1, 2, 3);

    expect(vec.x).toBe(1);
    expect(vec.y).toBe(2);
    expect(vec.z).toBe(3);
  });

  it('should set max int number', () => {
    const maxInteger = 2147483647 + 0;
    const vec = IVec3.MAX;

    expect(vec.x).toBe(0);
  });

  it('should set', () => {
    const vec = FVec3.create(1, 2, 3);

    expect(vec.x).toBe(1);
    expect(vec.y).toBe(2);
    expect(vec.z).toBe(3);

    vec.set(4, 5, 6);

    expect(vec.x).toBe(4);
    expect(vec.y).toBe(5);
    expect(vec.z).toBe(6);
  });

  it('should add', () => {
    let vec1 = FVec3.create(1, 2, 3);
    const vec2 = FVec3.create(4, 5, 6);

    vec1.add(vec2);

    expect(vec1.x).toBe(5);
    expect(vec1.y).toBe(7);
    expect(vec1.z).toBe(9);
  });

  it('should subtract', () => {
    const vec1 = FVec3.create(1, 2, 3);
    const vec2 = FVec3.create(4, 5, 6);

    vec1.sub(vec2);

    expect(vec1.x).toBe(-3);
    expect(vec1.y).toBe(-3);
    expect(vec1.z).toBe(-3);
  });

  it('should lerp', () => {
    const vec1 = FVec3.create(1, 2, 3);
    const vec2 = FVec3.create(4, 5, 6);

    vec1.lerp(vec2, 0.5);

    expect(vec1.x).toBe(2.5);
    expect(vec1.y).toBe(3.5);
    expect(vec1.z).toBe(4.5);
  });
  it('should lerpV', () => {
    const vec1 = FVec3.create(1, 2, 3);
    const vec2 = FVec3.create(4, 5, 6);

    vec1.lerpV(vec2);

    expect(vec1.x).toBe(13);
    expect(vec1.y).toBe(17);
    expect(vec1.z).toBe(21);
  });
  it('should max', () => {
    const vec1 = FVec3.create(1, 2, 3);
    const vec2 = FVec3.create(4, 5, 6);

    const result = vec1.max(vec2);

    expect(result).toEqual(FVec3.create(4, 5, 6));
  });

  it('should min', () => {
    const vec1 = FVec3.create(1, 2, 3);
    const vec2 = FVec3.create(4, 5, 6);

    const result = vec1.min(vec2);

    expect(result).toEqual(FVec3.create(1, 2, 3));
  });

  it('should mulScalar', () => {
    const vec = FVec3.create(1, 2, 3);

    const result = vec.mulScalar(2);

    expect(result).toEqual(FVec3.create(2, 4, 6));
  });

  it('should divScalar', () => {
    const vec = FVec3.create(2, 4, 6);

    const result = vec.divScalar(2);

    expect(result).toEqual(FVec3.create(1, 2, 3));
  });

  it('should cross', () => {
    const vec1 = FVec3.create(1, 0, 0);
    const vec2 = FVec3.create(0, 1, 0);

    const result = vec1.cross(vec2);

    expect(result).toEqual(FVec3.create(0, 0, 1));
  });

  it('should dot', () => {
    const vec1 = FVec3.create(1, 2, 3);
    const vec2 = FVec3.create(4, 5, 6);

    const result = vec1.dot(vec2);

    expect(result).toBe(32);
  });

  it('should length', () => {
    const vec = FVec3.create(1, 2, 2);

    const result = vec.len();

    expect(result).toBeCloseTo(3);
  });

  it('should lengthSq', () => {
    const vec = FVec3.create(1, 2, 2);

    const result = vec.lenSq();

    expect(result).toBe(9);
  });

  it('should distance', () => {
    const vec1 = FVec3.create(1, 2, 3);
    const vec2 = FVec3.create(4, 5, 6);

    const result = vec1.distance(vec2);

    expect(result).toBeCloseTo(5.196);
  });

  it('should distanceSq', () => {
    const vec1 = FVec3.create(1, 2, 3);
    const vec2 = FVec3.create(4, 5, 6);

    const result = vec1.distanceSq(vec2);

    expect(result).toBe(27);
  });

  it('should normalize', () => {
    const vec = FVec3.create(2, 0, 0);

    const result = vec.normalize();

    expect(result).toEqual(FVec3.create(1, 0, 0));
  });

  it('should negate', () => {
    const vec = FVec3.create(1, 2, 3);

    const result = vec.negate();

    expect(result).toEqual(FVec3.create(-1, -2, -3));
  });

  it('should copy', () => {
    const vec1 = FVec3.create();
    const vec2 = FVec3.create(1, 2, 3);

    const result = vec1.copy(vec2);

    expect(result).toEqual(FVec3.create(1, 2, 3));
  });

  it('should multiply', () => {
    const vec1 = FVec3.create(1, 2, 3);
    const vec2 = FVec3.create(2, 3, 4);

    const result = vec1.multiply(vec2);

    expect(result).toEqual(FVec3.create(2, 6, 12));
  });

  it('should divide', () => {
    const vec1 = FVec3.create(2, 6, 12);
    const vec2 = FVec3.create(2, 3, 4);

    const result = vec1.divide(vec2);

    expect(result).toEqual(FVec3.create(1, 2, 3));
  });

  it('should clone', () => {
    const vec = FVec3.create(1, 2, 3);

    const result = vec.clone();

    vec.set(4, 5, 6);

    expect(vec).toEqual(FVec3.create(4, 5, 6));
    expect(result).toEqual(FVec3.create(1, 2, 3));
  });

  it('should angle', () => {
    const vec1 = FVec3.create(1, 0, 0);
    const vec2 = FVec3.create(0, 1, 0);

    const result = vec1.angle(vec2);

    expect(result).toBeCloseTo(1.5707);
  });

  it('should equals', () => {
    const vec1 = FVec3.create(1, 2, 3);
    const vec2 = FVec3.create(1, 2, 3);

    const result = vec1.equals(vec2);

    expect(result).toBe(true);
  });

  it('should work woth int32', () => {
    const vec = IVec3.create(1.4, 2.2, 3.9);

    expect(vec.x).toBe(1); // 1.4 -> 1
    expect(vec.y).toBe(2); // 2.2 -> 2
    expect(vec.z).toBe(3); // 3.9 -> 3

    vec.divScalar(2);

    expect(vec.x).toBe(0); // 0.5 -> 0
    expect(vec.y).toBe(1); // 2 -> 1
    expect(vec.z).toBe(1); // 3 -> 1
  });
});
