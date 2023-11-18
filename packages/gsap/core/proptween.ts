import { globals } from './globals';
import {
  forEachName,
  isFunction,
  isUndefined,
  removeLinkedListItem,
} from './utils';

/*
 * --------------------------------------------------------------------------------------
 * PROPTWEEN
 * --------------------------------------------------------------------------------------
 */
export let setterPlain = (target: any, property: any, value: any) =>
  (target[property] = value);

export const setterFunc = (target: any, property: any, value: any) =>
  target[property](value);

export const setterFuncWithParam = (
  target: any,
  property: any,
  value: any,
  data: any
) => target[property](data.fp, value);

const setterAttribute = (target: any, property: any, value: any) =>
  target.setAttribute(property, value);

export const getSetter = (target: any, property: any) =>
  isFunction(target[property])
    ? setterFunc
    : isUndefined(target[property]) && target.setAttribute
    ? setterAttribute
    : setterPlain;

export const renderPlain = (ratio: any, data: any) =>
  data.set(
    data.t,
    data.p,
    Math.round((data.s + data.c * ratio) * 1000000) / 1000000,
    data
  );

export const renderBoolean = (ratio: any, data: any) =>
  data.set(data.t, data.p, !!(data.s + data.c * ratio), data);

const _renderComplexString = function (ratio: any, data: any) {
  let pt = data._pt,
    s = '';
  if (!ratio && data.b) {
    //b = beginning string
    s = data.b;
  } else if (ratio === 1 && data.e) {
    //e = ending string
    s = data.e;
  } else {
    while (pt) {
      s =
        pt.p +
        (pt.m
          ? pt.m(pt.s + pt.c * ratio)
          : Math.round((pt.s + pt.c * ratio) * 10000) / 10000) +
        s; //we use the "p" property for the text inbetween (like a suffix). And in the context of a complex string, the modifier (m) is typically just Math.round(), like for RGB colors.
      pt = pt._next;
    }
    s += data.c; //we use the "c" of the PropTween to store the final chunk of non-numeric text.
  }
  data.set(data.t, data.p, s, data);
};

export const renderPropTweens = function (ratio: any, data: any) {
  let pt = data._pt;
  while (pt) {
    pt.r(ratio, pt.d);
    pt = pt._next;
  }
};

export const addPluginModifier = function (
  this: any,
  modifier: any,
  tween: any,
  target: any,
  property: any
) {
  let pt = this._pt,
    next;
  while (pt) {
    next = pt._next;
    pt.p === property && pt.modifier(modifier, tween, target);
    pt = next;
  }
};
export const killPropTweensOf = function (this: any, property: any) {
  let pt = this._pt,
    hasNonDependentRemaining,
    next;
  while (pt) {
    next = pt._next;
    if ((pt.p === property && !pt.op) || pt.op === property) {
      removeLinkedListItem(this, pt, '_pt');
    } else if (!pt.dep) {
      hasNonDependentRemaining = 1;
    }
    pt = next;
  }
  return !hasNonDependentRemaining;
};
const _setterWithModifier = (
  target: any,
  property: any,
  value: any,
  data: any
) => {
  data.mSet(target, property, data.m.call(data.tween, value, data.mt), data);
};
const _sortPropTweensByPriority = (parent: any) => {
  let pt = parent._pt,
    next,
    pt2,
    first,
    last;
  //sorts the PropTween linked list in order of priority because some plugins need to do their work after ALL of the PropTweens were created (like RoundPropsPlugin and ModifiersPlugin)
  while (pt) {
    next = pt._next;
    pt2 = first;
    while (pt2 && pt2.pr > pt.pr) {
      pt2 = pt2._next;
    }
    if ((pt._prev = pt2 ? pt2._prev : last)) {
      pt._prev._next = pt;
    } else {
      first = pt;
    }
    if ((pt._next = pt2)) {
      pt2._prev = pt;
    } else {
      last = pt;
    }
    pt = next;
  }
  parent._pt = first;
};

//PropTween key: t = target, p = prop, r = renderer, d = data, s = start, c = change, op = overwriteProperty (ONLY populated when it's different than p), pr = priority, _next/_prev for the linked list siblings, set = setter, m = modifier, mSet = modifierSetter (the original setter, before a modifier was added)
export class PropTween {
  t: any;
  s: any;
  c: any;
  p: any;
  r: any;
  d: any;
  set: any;
  pr: any;
  _next: any;

  mSet: any;
  m: any;
  mt: any;
  tween: any;

  fp: any;

  constructor(
    next: any,
    target: any,
    prop: any,
    start: any,
    change: any,
    renderer?: any,
    data?: any,
    setter?: any,
    priority?: any
  ) {
    this.t = target;
    this.s = start;
    this.c = change;
    this.p = prop;
    this.r = renderer || renderPlain;
    this.d = data || this;
    this.set = setter || setterPlain;
    this.pr = priority || 0;
    this._next = next;
    if (next) {
      next._prev = this;
    }
  }

  modifier(func: any, tween: any, target: any) {
    this.mSet = this.mSet || this.set; //in case it was already set (a PropTween can only have one modifier)
    this.set = _setterWithModifier;
    this.m = func;
    this.mt = target; //modifier target
    this.tween = tween;
  }
}
