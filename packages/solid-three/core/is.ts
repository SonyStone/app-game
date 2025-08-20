export const is = {
  obj: (a: unknown): a is Record<string | number | symbol, unknown> =>
    a === Object(a) && !is.arr(a) && typeof a !== 'function',
  fun: (a: unknown): a is (...args: unknown[]) => unknown => typeof a === 'function',
  str: (a: unknown): a is string => typeof a === 'string',
  num: (a: unknown): a is number => typeof a === 'number',
  und: (a: unknown): a is undefined => a === void 0,
  arr: (a: unknown): a is unknown[] => Array.isArray(a),
  equ<T>(a: T, b: T): boolean {
    // Wrong type or one of the two undefined, doesn't match
    if (typeof a !== typeof b || !!a !== !!b) {
      return false;
    }
    // Atomic, just compare a against b
    if (is.str(a) || is.num(a) || is.obj(a)) {
      return a === b;
    }
    // Array, shallow compare first to see if it's a match
    if (is.arr(a) && a == b) {
      return true;
    }
    // Last resort, go through keys
    let i: string | undefined;
    for (i in a as Record<string, unknown>) {
      if (!(i in (b as Record<string, unknown>))) {
        return false;
      }
    }
    for (i in b as Record<string, unknown>) {
      if ((a as Record<string, unknown>)[i] !== (b as Record<string, unknown>)[i]) {
        return false;
      }
    }
    return is.und(i) ? a === b : true;
  }
};
