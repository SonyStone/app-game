import { describe, expect, it } from 'vitest';
import { Entity } from './entity';
import { SparseSet, Uint32SparseSet } from './util';

describe('util tests', () => {
  it('shuld SparseSet work', () => {
    const set = SparseSet();

    expect(set).toBeDefined();

    const eid1 = 2 as Entity;
    const eid2 = 4 as Entity;
    const eid3 = 6 as Entity;

    set.add(eid1);
    expect(set.has(eid1)).toBe(true);
    set.add(eid2);
    expect(set.has(eid2)).toBe(true);
    set.add(eid3);
    expect(set.has(eid3)).toBe(true);

    set.remove(eid1);
    expect(set.has(eid1)).toBe(false);
    set.remove(eid2);
    expect(set.has(eid2)).toBe(false);
    set.remove(eid3);
    expect(set.has(eid3)).toBe(false);
  });

  it('shuld Uint32SparseSet work', () => {
    const set = Uint32SparseSet(10);

    expect(set).toBeDefined();

    const eid1 = 2 as Entity;
    const eid2 = 4 as Entity;
    const eid3 = 6 as Entity;

    set.add(eid1);
    expect(set.has(eid1)).toBe(true);
    set.add(eid2);
    expect(set.has(eid2)).toBe(true);
    set.add(eid3);
    expect(set.has(eid3)).toBe(true);

    set.remove(eid1);
    expect(set.has(eid1)).toBe(false);
    set.remove(eid2);
    expect(set.has(eid2)).toBe(false);
    set.remove(eid3);
    expect(set.has(eid3)).toBe(false);
  });
});
