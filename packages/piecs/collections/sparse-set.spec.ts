import { describe, expect, it } from 'vitest';
import { createSparseSet } from './sparse-set';

describe('SparseSet', () => {
  it('has 0', () => {
    const set = createSparseSet();
    set.add(0);
    expect(set.has(0)).toBeTruthy();
  });

  it('has not 0', () => {
    const set = createSparseSet();
    expect(set.has(0)).toBeFalsy();
  });

  it('has no longer 0', () => {
    const set = createSparseSet();
    set.add(0);
    set.remove(0);
    expect(set.has(0)).toBeFalsy();
  });
});
