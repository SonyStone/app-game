//
// Only pure function
//

export const bigNum = 1e8;

export const tinyNum = 1 / bigNum;

export const _2PI = Math.PI * 2;

export const HALF_PI = _2PI / 4;

export const sqrt = Math.sqrt;

export const cos = Math.cos;

export const sin = Math.sin;

export const isString = (value: any): value is string =>
  typeof value === 'string';

export const isFunction = (value: any): value is Function =>
  typeof value === 'function';

export const isNumber = (value: any): value is number =>
  typeof value === 'number';

export const isUndefined = (value: any): value is undefined =>
  typeof value === 'undefined';

export const isObject = (value: any): value is Object =>
  typeof value === 'object';

export const isNotFalse = (value: any): value is true => value !== false;

export const windowExists = () => typeof window !== 'undefined';

export const isFuncOrString = (value: any) =>
  isFunction(value) || isString(value);

// note: IE10 has ArrayBuffer, but NOT ArrayBuffer.isView().
export const isTypedArray =
  (typeof ArrayBuffer === 'function' && ArrayBuffer.isView) || function () {};

export const isArray = Array.isArray;

/**
 * only numbers (including negatives and decimals) but NOT relative values.
 */
export const strictNumExp = /(?:-?\.?\d|\.)+/gi;

/**
 * finds any numbers, including ones that start with += or -=,
 * negative numbers, and ones in scientific notation like 1e-8.
 */
export const numExp = /[-+=.]*\d+[.e\-+]*\d*[e\-+]*\d*/g;

export const numWithUnitExp = /[-+=.]*\d+[.e-]*\d*[a-z%]*/g;

/**
 * duplicate so that while we're looping through matches from exec(),
 * it doesn't contaminate the lastIndex of _numExp which we use to search for colors too.
 */
export const complexStringNumExp = /[-+=.]*\d+\.?\d*(?:e-|e\+)?\d*/gi;

export const relExp = /[+-]=-?[.\d]+/;

/**
 * previously /[#\-+.]*\b[a-z\d\-=+%.]+/gi but didn't catch special characters.
 */
export const delimitedValueExp = /[^,'"\[\]\s]+/gi;

export const unitExp = /^[+\-=e\s\d]*\d+[.\d]*([a-z]*|%)\s*$/i;

export const round = (value: number) =>
  Math.round(value * 100000) / 100000 || 0;

/**
 * increased precision mostly for timing values.
 */
export const roundPrecise = (value: number) =>
  Math.round(value * 10000000) / 10000000 || 0;

export const parseRelative = (start: string | number, value: string) => {
  let operator = value.charAt(0);
  let end = parseFloat(value.substr(2));
  start = parseFloat(start as string);

  return operator === '+'
    ? start + end
    : operator === '-'
    ? start - end
    : operator === '*'
    ? start * end
    : start / end;
};

/**
 * searches one array to find matches for any of the items in the toFind array. As soon as one is found, it returns true. It does NOT return all the matches; it's simply a boolean search.
 */
export const arrayContainsAny = (toSearch: string, toFind: string) => {
  let l = toFind.length,
    i = 0;
  for (; toSearch.indexOf(toFind[i]) < 0 && ++i < l; ) {}
  return i < l;
};

export const missingPlugin = (property: any, value: any) =>
  console.warn(
    'Invalid property',
    property,
    'set to',
    value,
    'Missing plugin? gsap.registerPlugin()'
  );

export const warn = (message: any, suppress?: boolean) =>
  !suppress && console.warn(message);

export const numericIfPossible = (value: string) => {
  let n = parseFloat(value);
  return (n || n === 0) && (value + '').match(delimitedValueExp)!.length < 2
    ? n
    : isString(value)
    ? value.trim()
    : value;
};

/**
 * split a comma-delimited list of names into an array,
 * then run a forEach() function and return the split array
 * (this is just a way to consolidate/shorten some code).
 */
export const forEachName = (names: string | string[], func: any) => {
  (names = (names as string).split(',')).forEach(func);
  return names;
};

export const merge = (base: any, toMerge: any) => {
  for (let p in toMerge) {
    base[p] = toMerge[p];
  }
  return base;
};

export const mergeDeep = (base: any, toMerge: any) => {
  for (let p in toMerge) {
    p !== '__proto__' &&
      p !== 'constructor' &&
      p !== 'prototype' &&
      (base[p] = isObject(toMerge[p])
        ? mergeDeep(base[p] || (base[p] = {}), toMerge[p])
        : toMerge[p]);
  }
  return base;
};

export const passThrough = <T>(p: T): T => p;

export const setDefaults = (obj: any, defaults: any) => {
  for (let p in defaults) {
    p in obj || (obj[p] = defaults[p]);
  }
  return obj;
};

export const setKeyframeDefaults =
  (excludeDuration: any) => (obj: any, defaults: any) => {
    for (let p in defaults) {
      p in obj ||
        (p === 'duration' && excludeDuration) ||
        p === 'ease' ||
        (obj[p] = defaults[p]);
    }
  };

export const copyExcluding = (obj: any, excluding: any) => {
  let copy: any = {};
  let p;

  for (p in obj) {
    p in excluding || (copy[p] = obj[p]);
  }

  return copy;
};

export const arraysMatch = (a1: any[], a2: any[]) => {
  let i = a1.length;
  let match = i === a2.length;
  while (match && i-- && a1[i] === a2[i]) {}

  return i < 0;
};

export const addLinkedListItem = (
  parent: any,
  child: any,
  firstProp: string = '_first',
  lastProp: string = '_last',
  sortBy: any
) => {
  let prev = parent[lastProp];
  let t;

  if (sortBy) {
    t = child[sortBy];
    while (prev && prev[sortBy] > t) {
      prev = prev._prev;
    }
  }

  if (prev) {
    child._next = prev._next;
    prev._next = child;
  } else {
    child._next = parent[firstProp];
    parent[firstProp] = child;
  }

  if (child._next) {
    child._next._prev = child;
  } else {
    parent[lastProp] = child;
  }

  child._prev = prev;
  child.parent = child._dp = parent;

  return child;
};

export const removeLinkedListItem = (
  parent: any,
  child: any,
  firstProp: string = '_first',
  lastProp: string = '_last'
) => {
  let prev = child._prev;
  let next = child._next;

  if (prev) {
    prev._next = next;
  } else if (parent[firstProp] === child) {
    parent[firstProp] = next;
  }

  if (next) {
    next._prev = prev;
  } else if (parent[lastProp] === child) {
    parent[lastProp] = prev;
  }

  // don't delete the _dp just so we can revert if necessary.
  // But parent should be null to indicate the item isn't in a linked list.
  child._next = child._prev = child.parent = null;
};

export const removeFromParent = (
  child: any,
  onlyIfParentHasAutoRemove?: any
) => {
  child.parent &&
    (!onlyIfParentHasAutoRemove || child.parent.autoRemoveChildren) &&
    child.parent.remove(child);
  child._act = 0;
};

export const uncache = (animation: any, child?: any) => {
  if (
    animation &&
    (!child || child._end > animation._dur || child._start < 0)
  ) {
    // performance optimization: if a child animation is passed in
    // we should only uncache if that child EXTENDS the animation
    // (its end time is beyond the end)
    let a = animation;
    while (a) {
      a._dirty = 1;
      a = a.parent;
    }
  }
  return animation;
};

export const recacheAncestors = (animation: any) => {
  let parent = animation.parent;
  while (parent && parent.parent) {
    //sometimes we must force a re-sort of all children and update
    // the duration/totalDuration of all ancestor timelines immediately in case,
    // for example, in the middle of a render loop,
    //startTime before 0, forcing the parent timeline to shift around and shiftChildren()
    // which could affect that next tween's render (startTime).
    // Doesn't matter for the root timeline though. one tween alters another tween's timeScale which shoves its
    parent._dirty = 1;
    parent.totalDuration();
    parent = parent.parent;
  }
  return animation;
};

export const hasNoPausedAncestors = (animation: any): boolean =>
  !animation || (animation._ts && hasNoPausedAncestors(animation.parent));

// feed in the totalTime and cycleDuration and it'll return the cycle
// (iteration minus 1) and if the playhead is exactly at the very END,
// it will NOT bump up to the next cycle.
export const animationCycle = (tTime: any, cycleDuration: any) => {
  let whole = Math.floor((tTime /= cycleDuration));
  return tTime && whole === tTime ? whole - 1 : whole;
};

export const elapsedCycleDuration = (animation: any) =>
  animation._repeat
    ? animationCycle(
        animation._tTime,
        (animation = animation.duration() + animation._rDelay)
      ) * animation
    : 0;

export const parentToChildTotalTime = (parentTime: any, child: any) =>
  (parentTime - child._start) * child._ts +
  (child._ts >= 0 ? 0 : child._dirty ? child.totalDuration() : child._tDur);

export const setEnd = (animation: any) =>
  (animation._end = roundPrecise(
    animation._start +
      (animation._tDur / Math.abs(animation._ts || animation._rts || tinyNum) ||
        0)
  ));

export const conditionalReturn = (value: any, func: any) =>
  value || value === 0 ? func(value) : func;

export const random = (
  min: any,
  max: any,
  roundingIncrement?: any,
  returnFunction?: any
) =>
  conditionalReturn(
    isArray(min)
      ? !max
      : roundingIncrement === true
      ? !!(roundingIncrement = 0)
      : !returnFunction,
    () =>
      isArray(min)
        ? min[~~(Math.random() * min.length)]
        : (roundingIncrement = roundingIncrement || 1e-5) &&
          (returnFunction =
            roundingIncrement < 1
              ? 10 ** ((roundingIncrement + '').length - 2)
              : 1) &&
          Math.floor(
            Math.round(
              (min -
                roundingIncrement / 2 +
                Math.random() * (max - min + roundingIncrement * 0.99)) /
                roundingIncrement
            ) *
              roundingIncrement *
              returnFunction
          ) / returnFunction
  );

export const replaceRandom = (value: any) => {
  //replaces all occurrences of random(...) in a string with the calculated random value. can be a range like random(-100, 100, 5) or an array like random([0, 100, 500])
  let prev = 0,
    s = '',
    i,
    nums,
    end,
    isArray;
  while (~(i = value.indexOf('random(', prev))) {
    end = value.indexOf(')', i);
    isArray = value.charAt(i + 7) === '[';
    nums = value
      .substr(i + 7, end - i - 7)
      .match(isArray ? delimitedValueExp : strictNumExp);
    s +=
      value.substr(prev, i - prev) +
      random(
        isArray ? nums : +nums[0],
        isArray ? 0 : +nums[1],
        +nums[2] || 1e-5
      );
    prev = end + 1;
  }
  return s + value.substr(prev, value.length - prev);
};

// note: protect against padded numbers as strings, like "100.100".
// That shouldn't return "00" as the unit.
// If it's numeric, return no unit.
export const getUnit = (value: any, v?: any) =>
  !isString(value) || !(v = unitExp.exec(value)) ? '' : v[1];

export const emptyFunc = () => 0;

export const isFromOrFromStart = ({ data }: any) =>
  data === 'isFromStart' || data === 'isStart';

export const slice = [].slice;

const _clamp = (min: any, max: any, value: any) =>
  value < min ? min : value > max ? max : value;

export const clamp = (min: any, max: any, value: any) =>
  conditionalReturn(value, (v: any) => _clamp(min, max, v));
