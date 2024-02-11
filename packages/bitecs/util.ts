import { Entity } from './entity';

export interface Uint32SparseSet {
  add: (val: Entity) => void;
  remove: (val: Entity) => void;
  has: (val: Entity) => boolean;
  /**
   * index -> entityId
   */
  dense: Uint32Array;
  /**
   * entityId -> dense.index
   */
  sparse: Uint32Array;
  reset: () => void;
}

export const Uint32SparseSet = (length: number): Uint32SparseSet => {
  let cursor = 0;
  const dense = Object.assign(new Uint32Array(length), {
    count() {
      cursor + 1;
    },
    push(val: Entity) {
      dense[cursor] = val;
      cursor++;
      return cursor;
    },
    pop() {
      const value = dense[cursor];
      dense[cursor] = 0;
      cursor--;
      return value;
    }
  });

  const sparse = new Uint32Array(length);

  const has = (val: Entity) => dense[sparse[val]] === val;

  const add = (val: Entity) => {
    if (has(val)) {
      return;
    }
    sparse[val] = dense.push(val) - 1;
  };

  const remove = (val: Entity) => {
    if (!has(val)) {
      return;
    }
    const index = sparse[val];
    const swapped = dense.pop();

    if (swapped !== val) {
      dense[index] = swapped;
      sparse[swapped] = index;
    }
  };

  const reset = () => {
    for (let i = 0; i < length; i++) {
      dense[i] = 0;
      sparse[i] = 0;
    }
  };

  return {
    add,
    remove,
    has,
    sparse,
    dense,
    reset
  };
};

export interface SparseSet {
  add: (val: Entity) => void;
  remove: (val: Entity) => void;
  has: (val: Entity) => boolean;
  /**
   * index -> entityId
   */
  sparse: Entity[];
  /**
   * entityId -> dense.index
   */
  dense: Entity[];
  reset: () => void;
}

export const SparseSet = (): SparseSet => {
  class DenseArray extends Array {
    override sort(compareFn: (a: Entity, b: Entity) => Entity): this {
      const result = super.sort.call(this, compareFn);

      for (let i = 0 as Entity; i < dense.length; i++) {
        sparse[dense[i]] = i;
      }

      return result;
    }
  }

  const dense: Entity[] = new DenseArray();
  const sparse: Entity[] = [];

  const has = (val: Entity) => dense[sparse[val]] === val;

  const add = (val: Entity) => {
    if (has(val)) {
      return;
    }
    sparse[val] = (dense.push(val) - 1) as Entity;
  };

  const remove = (val: Entity) => {
    if (!has(val)) {
      return;
    }
    const index = sparse[val]!;
    const swapped = dense.pop()!;
    if (swapped !== val) {
      dense[index] = swapped;
      sparse[swapped] = index;
    }
  };

  const reset = () => {
    dense.length = 0;
    sparse.length = 0;
  };

  return {
    add,
    remove,
    has,
    sparse,
    dense,
    reset
  };
};

export interface BrandType<T extends string> {
  readonly __opaqueType: T;
}
