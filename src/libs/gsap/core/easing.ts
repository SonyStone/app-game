import { callbackNames } from './core';
import { globals } from './globals';
import { Timeline } from './timeline';
import {
  _2PI,
  cos,
  forEachName,
  HALF_PI,
  numericIfPossible,
  sin,
  sqrt,
  isFunction,
} from './utils';

export const invertEase = (ease: any) => (p: any) => 1 - ease(1 - p);

export const parseEase = (ease: any, defaultEase?: any) =>
  !ease
    ? defaultEase
    : (isFunction(ease)
        ? ease
        : _easeMap[ease] || _configEaseFromString(ease)) || defaultEase;

/*
 * -------------------------------------------------
 * EASING
 * -------------------------------------------------
 */
export const _easeMap: any = {};

const _customEaseExp = /^[\d.\-M][\d.\-,\s]/;
const _quotesExp = /["']/g;
const _parseObjectInString = (value: any) => {
  //takes a string like "{wiggles:10, type:anticipate})" and turns it into a real object. Notice it ends in ")" and includes the {} wrappers. This is because we only use this function for parsing ease configs and prioritized optimization rather than reusability.
  let obj: any = {},
    split = value.substr(1, value.length - 3).split(':'),
    key = split[0],
    i = 1,
    l = split.length,
    index,
    val,
    parsedVal;
  for (; i < l; i++) {
    val = split[i];
    index = i !== l - 1 ? val.lastIndexOf(',') : val.length;
    parsedVal = val.substr(0, index);
    obj[key] = isNaN(parsedVal)
      ? parsedVal.replace(_quotesExp, '').trim()
      : +parsedVal;
    key = val.substr(index + 1).trim();
  }
  return obj;
};

const _valueInParentheses = (value: any) => {
  let open = value.indexOf('(') + 1,
    close = value.indexOf(')'),
    nested = value.indexOf('(', open);
  return value.substring(
    open,
    ~nested && nested < close ? value.indexOf(')', close + 1) : close
  );
};

const _configEaseFromString = (name: any) => {
  // name can be a string like "elastic.out(1,0.5)",
  // and pass in _easeMap as obj and it'll parse it out and call
  // the actual function like _easeMap.Elastic.easeOut.config(1,0.5).
  // It will also parse custom ease strings as long as CustomEase is loaded and registered
  // (internally as _easeMap._CE).
  let split = (name + '').split('('),
    ease = _easeMap[split[0]];
  return ease && split.length > 1 && ease.config
    ? ease.config.apply(
        null,
        ~name.indexOf('{')
          ? [_parseObjectInString(split[1])]
          : _valueInParentheses(name).split(',').map(numericIfPossible)
      )
    : _easeMap._CE && _customEaseExp.test(name)
    ? _easeMap._CE('', name)
    : ease;
};

// allow yoyoEase to be set in children and have those affected when the parent/ancestor timeline yoyos.
const _propagateYoyoEase = (timeline: any, isYoyo: any) => {
  let child = timeline._first,
    ease;
  while (child) {
    if (child instanceof Timeline) {
      _propagateYoyoEase(child, isYoyo);
    } else if (
      child.vars.yoyoEase &&
      (!child._yoyo || !child._repeat) &&
      child._yoyo !== isYoyo
    ) {
      if (child.timeline) {
        _propagateYoyoEase(child.timeline, isYoyo);
      } else {
        ease = child._ease;
        child._ease = child._yEase;
        child._yEase = ease;
        child._yoyo = isYoyo;
      }
    }
    child = child._next;
  }
};

const shortNames: { [key: string]: string } = {
  easeIn: 'in',
  easeOut: 'out',
  easeInOut: 'inOut',
};

const insertEase = (
  names: string,
  easeIn?: any,
  easeOut = (p: number) => 1 - easeIn(1 - p),
  easeInOut = (p: number) =>
    p < 0.5 ? easeIn(p * 2) / 2 : 1 - easeIn((1 - p) * 2) / 2
) => {
  const ease = { easeIn, easeOut, easeInOut };

  let lowercaseName: string;

  forEachName(names, (name: string) => {
    _easeMap[name] = ease;
    globals[name] = ease;

    lowercaseName = name.toLowerCase();
    _easeMap[lowercaseName] = easeOut;

    for (const [key, value] of Object.entries(ease)) {
      _easeMap[`${lowercaseName}.${shortNames[key]}`] = value;
      _easeMap[`${name}.${key}`] = value;
    }
  });

  return ease;
};

const easeInOutFromOut = (easeOut: any) => (p) =>
  p < 0.5 ? (1 - easeOut(1 - p * 2)) / 2 : 0.5 + easeOut((p - 0.5) * 2) / 2;

const configElastic = (type?: string, amplitude?: any, period?: any) => {
  // note: if amplitude is < 1, we simply adjust the period for a more natural feel.
  // Otherwise the math doesn't work right and the curve starts at 1.
  const p1 = amplitude >= 1 ? amplitude : 1;
  let p2 = (period || (type ? 0.3 : 0.45)) / (amplitude < 1 ? amplitude : 1);
  const p3 = (p2 / _2PI) * (Math.asin(1 / p1) || 0);
  const easeOut = (p: number) =>
    p === 1 ? 1 : p1 * 2 ** (-10 * p) * sin((p - p3) * p2) + 1;
  const ease: any =
    type === 'out'
      ? easeOut
      : type === 'in'
      ? (p: number) => 1 - easeOut(1 - p)
      : easeInOutFromOut(easeOut);

  //precalculate to optimize;
  // ?????
  p2 = _2PI / p2;

  ease.config = (amplitude: number, period: number) =>
    configElastic(type, amplitude, period);

  return ease;
};

const _configBack = (type?: string, overshoot = 1.70158) => {
  let easeOut = (p: any) =>
    p ? --p * p * ((overshoot + 1) * p + overshoot) + 1 : 0;

  let ease: any =
    type === 'out'
      ? easeOut
      : type === 'in'
      ? (p: any) => 1 - easeOut(1 - p)
      : easeInOutFromOut(easeOut);

  ease.config = (overshoot: any) => _configBack(type, overshoot);

  return ease;
};
// a cheaper (kb and cpu) but more mild way to get a parameterized weighted ease by feeding in a value between -1 (easeIn) and 1 (easeOut) where 0 is linear.
// _weightedEase = ratio => {
// 	let y = 0.5 + ratio / 2;
// 	return p => (2 * (1 - p) * p * y + p * p);
// },
// a stronger (but more expensive kb/cpu) parameterized weighted ease that lets you feed in a value between -1 (easeIn) and 1 (easeOut) where 0 is linear.
// _weightedEaseStrong = ratio => {
// 	ratio = .5 + ratio / 2;
// 	let o = 1 / 3 * (ratio < .5 ? ratio : 1 - ratio),
// 		b = ratio - o,
// 		c = ratio + o;
// 	return p => p === 1 ? p : 3 * b * (1 - p) * (1 - p) * p + 3 * c * (1 - p) * p * p + p * p * p;
// };

forEachName(
  'Linear,Quad,Cubic,Quart,Quint,Strong',
  (name: string, i: number) => {
    let power = i < 5 ? i + 1 : i;
    insertEase(
      name + ',Power' + (power - 1),
      i ? (p: number) => p ** power : (p: number) => p,
      (p) => 1 - (1 - p) ** power,
      (p) => (p < 0.5 ? (p * 2) ** power / 2 : 1 - ((1 - p) * 2) ** power / 2)
    );
  }
);

_easeMap.Linear.easeNone = _easeMap.none = _easeMap.Linear.easeIn;

insertEase(
  'Elastic',
  configElastic('in'),
  configElastic('out'),
  configElastic()
);

((n, c) => {
  let n1 = 1 / c,
    n2 = 2 * n1,
    n3 = 2.5 * n1,
    easeOut = (p: any) =>
      p < n1
        ? n * p * p
        : p < n2
        ? n * (p - 1.5 / c) ** 2 + 0.75
        : p < n3
        ? n * (p -= 2.25 / c) * p + 0.9375
        : n * (p - 2.625 / c) ** 2 + 0.984375;
  insertEase('Bounce', (p) => 1 - easeOut(1 - p), easeOut);
})(7.5625, 2.75);

insertEase('Expo', (p: any) => (p ? 2 ** (10 * (p - 1)) : 0));
insertEase('Circ', (p: any) => -(sqrt(1 - p * p) - 1));
insertEase('Sine', (p: any) => (p === 1 ? 1 : -cos(p * HALF_PI) + 1));
insertEase('Back', _configBack('in'), _configBack('out'), _configBack());
_easeMap.SteppedEase =
  _easeMap.steps =
  globals.SteppedEase =
    {
      config(steps = 1, immediateStart) {
        let p1 = 1 / steps,
          p2 = steps + (immediateStart ? 0 : 1),
          p3 = immediateStart ? 1 : 0,
          max = 1 - _tinyNum;
        return (p) => (((p2 * _clamp(0, max, p)) | 0) + p3) * p1;
      },
    };

defaults.ease = _easeMap['quad.out'];

forEachName(
  'onComplete,onUpdate,onStart,onRepeat,onReverseComplete,onInterrupt',
  (name: string) => (callbackNames += name + ',' + name + 'Params,')
);
