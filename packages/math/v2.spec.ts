import { describe, expect, it } from 'vitest';
import { FVec2, IVec2, UVec2 } from './v2';

describe('v2', () => {
  it('should use consts', () => {
    const zero = FVec2.ZERO;

    expect(zero.x).toBe(0);
    expect(zero.y).toBe(0);
  });

  it('should set max 32int number', () => {
    const vec = IVec2.MAX;

    expect(vec.x).toBe(2147483647);
  });

  it('should set max 32uint number', () => {
    const vec = UVec2.MAX;

    expect(vec.x).toBe(4294967295);
  });

  it('should create new Vec2', () => {
    const vec = FVec2.create(1, 2);

    expect(vec.x).toBe(1);
    expect(vec.y).toBe(2);
  });

  it('should set', () => {
    const vec = FVec2.create(1, 2);

    expect(vec.x).toBe(1);
    expect(vec.y).toBe(2);

    vec.set(4, 5);

    expect(vec.x).toBe(4);
    expect(vec.y).toBe(5);
  });

  it('should add', () => {
    let vec1 = FVec2.create(1, 2);
    const vec2 = FVec2.create(4, 5);

    vec1.add(vec2);

    expect(vec1.x).toBe(5);
    expect(vec1.y).toBe(7);
  });

  it('should subtract', () => {
    const vec1 = FVec2.create(1, 2);
    const vec2 = FVec2.create(4, 5);

    vec1.sub(vec2);

    expect(vec1.x).toBe(-3);
    expect(vec1.y).toBe(-3);
  });

  it('should lerp', () => {
    const vec1 = FVec2.create(1, 2);
    const vec2 = FVec2.create(4, 5);

    vec1.lerp(vec2, 0.5);

    expect(vec1.x).toBe(2.5);
    expect(vec1.y).toBe(3.5);
  });
  it('should lerpV', () => {
    const vec1 = FVec2.create(1, 2);
    const vec2 = FVec2.create(4, 5);
    const vec3 = FVec2.create(7, 8);

    vec1.lerpV(vec2, vec3);

    expect(vec1.x).toBe(13);
    expect(vec1.y).toBe(17);
  });
  it('should max', () => {
    const vec1 = FVec2.create(1, 2);
    const vec2 = FVec2.create(4, 5);

    const result = vec1.max(vec2);

    expect(result).toEqual(FVec2.create(4, 5));
  });

  it('should min', () => {
    const vec1 = FVec2.create(1, 2);
    const vec2 = FVec2.create(4, 5);

    const result = vec1.min(vec2);

    expect(result).toEqual(FVec2.create(1, 2));
  });

  it('should mulScalar', () => {
    const vec = FVec2.create(1, 2);

    const result = vec.mulScalar(2);

    expect(result).toEqual(FVec2.create(2, 4));
  });

  it('should divScalar', () => {
    const vec = FVec2.create(2, 4);

    const result = vec.divScalar(2);

    expect(result).toEqual(FVec2.create(1, 2));
  });

  it('should dot', () => {
    const vec1 = FVec2.create(1, 2);
    const vec2 = FVec2.create(4, 5);

    const result = vec1.dot(vec2);

    expect(result).toBe(32);
  });

  it('should length', () => {
    const vec = FVec2.create(1, 2);

    const result = vec.len();

    expect(result).toBeCloseTo(3);
  });

  it('should lengthSq', () => {
    const vec = FVec2.create(1, 2);

    const result = vec.lenSq();

    expect(result).toBe(9);
  });

  it('should distance', () => {
    const vec1 = FVec2.create(1, 2);
    const vec2 = FVec2.create(4, 5);

    const result = vec1.distance(vec2);

    expect(result).toBeCloseTo(5.196);
  });

  it('should distanceSq', () => {
    const vec1 = FVec2.create(1, 2);
    const vec2 = FVec2.create(4, 5);

    const result = vec1.distanceSq(vec2);

    expect(result).toBe(27);
  });

  it('should normalize', () => {
    const vec = FVec2.create(2, 0);

    const result = vec.normalize();

    expect(result).toEqual(FVec2.create(1, 0));
  });

  it('should negate', () => {
    const vec = FVec2.create(1, 2);

    const result = vec.negate();

    expect(result).toEqual(FVec2.create(-1, -2));
  });

  it('should copy', () => {
    const vec1 = FVec2.create();
    const vec2 = FVec2.create(1, 2);

    const result = vec1.copy(vec2);

    expect(result).toEqual(FVec2.create(1, 2));
  });

  it('should multiply', () => {
    const vec1 = FVec2.create(1, 2);
    const vec2 = FVec2.create(2, 3);

    const result = vec1.mul(vec2);

    expect(result).toEqual(FVec2.create(2, 6));
  });

  it('should divide', () => {
    const vec1 = FVec2.create(2, 6);
    const vec2 = FVec2.create(2, 3);

    const result = vec1.div(vec2);

    expect(result).toEqual(FVec2.create(1, 2));
  });

  it('should clone', () => {
    const vec = FVec2.create(1, 2);

    const result = vec.clone();

    vec.set(4, 5);

    expect(vec).toEqual(FVec2.create(4, 5));
    expect(result).toEqual(FVec2.create(1, 2));
  });

  it('should angle', () => {
    const vec1 = FVec2.create(1, 0);
    const vec2 = FVec2.create(0, 1);

    const result = vec1.angle(vec2);

    expect(result).toBeCloseTo(1.5707);
  });

  it('should equals', () => {
    const vec1 = FVec2.create(1, 2);
    const vec2 = FVec2.create(1, 2);

    const result = vec1.equals(vec2);

    expect(result).toBe(true);
  });

  it('should work woth int32', () => {
    const vec = IVec2.create(1.4, 2.2);

    expect(vec.x).toBe(1); // 1.4 -> 1
    expect(vec.y).toBe(2); // 2.2 -> 2

    vec.divScalar(2);

    expect(vec.x).toBe(0); // 0.5 -> 0
    expect(vec.y).toBe(1); // 2 -> 1
  });
});
