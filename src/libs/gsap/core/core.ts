import { colorStringFilter, splitColor } from './colors';
import { config } from './config';
import { plugins, reservedProps } from './createPlugin';
import { invertEase, parseEase, _easeMap } from './easing';
import { buildModifierPlugin } from './extra-plugins';
import { addGlobal, globals } from './globals';
import { _gsap } from './gsap';
import { GSCache } from './GSCache';
import { harness } from './harness';
import {
  addPluginModifier,
  getSetter,
  killPropTweensOf,
  renderPropTweens,
} from './proptween';
import { ticker, wake } from './tiker';
import { addPropTween, initTween, Timeline } from './timeline';
import { Tween } from './tween';
import {
  addLinkedListItem,
  animationCycle,
  bigNum,
  conditionalReturn,
  copyExcluding,
  delimitedValueExp,
  emptyFunc,
  forEachName,
  getUnit,
  isArray,
  isFromOrFromStart,
  isFunction,
  isNotFalse,
  isNumber,
  isObject,
  isString,
  isUndefined,
  merge,
  missingPlugin,
  numExp,
  numWithUnitExp,
  parentToChildTotalTime,
  parseRelative,
  random,
  relExp,
  removeFromParent,
  removeLinkedListItem,
  replaceRandom,
  round,
  roundPrecise,
  setDefaults,
  setEnd,
  setKeyframeDefaults,
  slice,
  sqrt,
  strictNumExp,
  tinyNum,
  uncache,
  unitExp,
  warn,
  windowExists,
} from './utils';

const defaults = {
  duration: 0.5,
  overwrite: false,
  delay: 0,
};

export const globalTimeline = new Timeline({
  sortChildren: false,
  defaults: defaults,
  autoRemoveChildren: true,
  id: 'root',
  smoothChildTiming: true,
});

let win: Window;
let coreInitted: any;
let doc: Document;

let coreReady;

const lazyTweens: any[] = [];

let lazyLookup: any = {};
let lastRenderedFrame: any;

const effects: any = {};

const nextGCFrame = 30;

export const callbackNames = '';

const getCache = (target: any) =>
  target._gsap || harness(toArray(target))[0]._gsap;

const _lazyRender = () => {
  let l = lazyTweens.length;
  let a = lazyTweens.slice(0);
  let i;
  let tween;

  lazyLookup = {};
  lazyTweens.length = 0;

  for (i = 0; i < l; i++) {
    tween = a[i];
    tween &&
      tween._lazy &&
      (tween.render(tween._lazy[0], tween._lazy[1], true)._lazy = 0);
  }
};

const _lazySafeRender = (
  animation: any,
  time: number,
  suppressEvents?: boolean,
  force?: boolean
) => {
  lazyTweens.length && _lazyRender();
  animation.render(time, suppressEvents, force);
  lazyTweens.length && _lazyRender(); //in case rendering caused any tweens to lazy-init, we should render them because typically when someone calls seek() or time() or progress(), they expect an immediate render.
};

export const inheritDefaults = (vars: any) => {
  let parent = vars.parent || globalTimeline; // ! side effect
  const func = vars.keyframes
    ? setKeyframeDefaults(isArray(vars.keyframes))
    : setDefaults;

  if (isNotFalse(vars.inherit)) {
    while (parent) {
      func(vars, parent.vars.defaults);
      parent = parent.parent || parent._dp;
    }
  }
  return vars;
};

const _alignPlayhead = (animation: any, totalTime: any) => {
  // adjusts the animation's _start and _end according to the provided totalTime (only if the parent's smoothChildTiming is true and the animation isn't paused). It doesn't do any rendering or forcing things back into parent timelines, etc. - that's what totalTime() is for.
  let parent = animation._dp;
  if (parent && parent.smoothChildTiming && animation._ts) {
    animation._start = roundPrecise(
      parent._time -
        (animation._ts > 0
          ? totalTime / animation._ts
          : ((animation._dirty ? animation.totalDuration() : animation._tDur) -
              totalTime) /
            -animation._ts)
    );
    setEnd(animation);
    parent._dirty || uncache(parent, animation); //for performance improvement. If the parent's cache is already dirty, it already took care of marking the ancestors as dirty too, so skip the function call here.
  }
  return animation;
};
/*
_totalTimeToTime = (clampedTotalTime, duration, repeat, repeatDelay, yoyo) => {
  let cycleDuration = duration + repeatDelay,
    time = _round(clampedTotalTime % cycleDuration);
  if (time > duration) {
    time = duration;
  }
  return (yoyo && (~~(clampedTotalTime / cycleDuration) & 1)) ? duration - time : time;
},
*/

const _postAddChecks = (timeline: any, child: any) => {
  let t;
  if (child._time || (child._initted && !child._dur)) {
    //in case, for example, the _start is moved on a tween that has already rendered. Imagine it's at its end state, then the startTime is moved WAY later (after the end of this timeline), it should render at its beginning.
    t = parentToChildTotalTime(timeline.rawTime(), child);
    if (
      !child._dur ||
      _clamp(0, child.totalDuration(), t) - child._tTime > tinyNum
    ) {
      child.render(t, true);
    }
  }
  //if the timeline has already ended but the inserted tween/timeline extends the duration, we should enable this timeline again so that it renders properly. We should also align the playhead with the parent timeline's when appropriate.
  if (
    uncache(timeline, child)._dp &&
    timeline._initted &&
    timeline._time >= timeline._dur &&
    timeline._ts
  ) {
    //in case any of the ancestors had completed but should now be enabled...
    if (timeline._dur < timeline.duration()) {
      t = timeline;
      while (t._dp) {
        t.rawTime() >= 0 && t.totalTime(t._tTime); //moves the timeline (shifts its startTime) if necessary, and also enables it. If it's currently zero, though, it may not be scheduled to render until later so there's no need to force it to align with the current playhead position. Only move to catch up with the playhead.
        t = t._dp;
      }
    }

    // helps ensure that the next render() will be forced (crossingStart = true in render()),
    // even if the duration hasn't changed (we're adding a child which would need to get rendered).
    // Definitely an edge case.
    //
    // Note: we MUST do this AFTER the loop above where the totalTime() might trigger a render()
    // because this _addToTimeline() method gets called from the Animation  constructor,
    // BEFORE tweens even record their targets, etc. so we wouldn't want things to get triggered in the wrong order.
    timeline._zTime = -tinyNum;
  }
};

export const addToTimeline = (
  timeline: any,
  child: any,
  position: any,
  skipChecks?: any
) => {
  child.parent && removeFromParent(child);
  child._start = roundPrecise(
    (isNumber(position)
      ? position
      : position || timeline !== globalTimeline
      ? parsePosition(timeline, position, child)
      : timeline._time) + child._delay
  );

  child._end = roundPrecise(
    child._start + (child.totalDuration() / Math.abs(child.timeScale()) || 0)
  );

  addLinkedListItem(
    timeline,
    child,
    '_first',
    '_last',
    timeline._sort ? '_start' : 0
  );

  isFromOrFromStart(child) || (timeline._recent = child);

  skipChecks || _postAddChecks(timeline, child);

  return timeline;
};

export const scrollTrigger = (animation: any, trigger: any) =>
  (globals.ScrollTrigger || missingPlugin('scrollTrigger', trigger)) &&
  globals.ScrollTrigger.create(trigger, animation);

const attemptInitTween = (
  tween: any,
  totalTime: any,
  force: any,
  suppressEvents: any
) => {
  initTween(tween, totalTime);
  if (!tween._initted) {
    return 1;
  }
  if (
    !force &&
    tween._pt &&
    ((tween._dur && tween.vars.lazy !== false) ||
      (!tween._dur && tween.vars.lazy)) &&
    lastRenderedFrame !== ticker.frame
  ) {
    lazyTweens.push(tween);
    tween._lazy = [totalTime, suppressEvents];
    return 1;
  }
};

const _parentPlayheadIsBeforeStart = ({ parent }: any): boolean =>
  parent &&
  parent._ts &&
  parent._initted &&
  !parent._lock &&
  (parent.rawTime() < 0 || _parentPlayheadIsBeforeStart(parent)); // check parent's _lock because when a timeline repeats/yoyos and does its artificial wrapping, we shouldn't force the ratio back to 0

const _renderZeroDurationTween = (
  tween: any,
  totalTime: any,
  suppressEvents: any,
  force: any
) => {
  let prevRatio = tween.ratio;

  // if the tween or its parent is reversed and the totalTime is 0,
  // we should go to a ratio of 0.
  // Edge case: if a from() or fromTo() stagger tween is placed later in a timeline,
  // the "startAt" zero-duration tween could initially render at a time when the parent timeline's playhead is technically
  // BEFORE where this tween is, so make sure that any "from" and "fromTo" startAt tweens are rendered the first time at a ratio of 1.
  let ratio =
    totalTime < 0 ||
    (!totalTime &&
      ((!tween._start &&
        _parentPlayheadIsBeforeStart(tween) &&
        !(!tween._initted && isFromOrFromStart(tween))) ||
        ((tween._ts < 0 || tween._dp._ts < 0) && !isFromOrFromStart(tween))))
      ? 0
      : 1;
  const repeatDelay = tween._rDelay;
  let tTime = 0;
  let pt;
  let iteration;
  let prevIteration;

  if (repeatDelay && tween._repeat) {
    // in case there's a zero-duration tween that has a repeat with a repeatDelay
    tTime = _clamp(0, tween._tDur, totalTime);
    iteration = animationCycle(tTime, repeatDelay);
    tween._yoyo && iteration & 1 && (ratio = 1 - ratio);
    if (iteration !== animationCycle(tween._tTime, repeatDelay)) {
      // if iteration changed
      prevRatio = 1 - ratio;
      tween.vars.repeatRefresh && tween._initted && tween.invalidate();
    }
  }
  if (
    ratio !== prevRatio ||
    force ||
    tween._zTime === tinyNum ||
    (!totalTime && tween._zTime)
  ) {
    if (
      !tween._initted &&
      attemptInitTween(tween, totalTime, force, suppressEvents)
    ) {
      // if we render the very beginning (time == 0) of a fromTo(), we must force the render (normal tweens wouldn't need to render at a time of 0 when the prevTime was also 0). This is also mandatory to make sure overwriting kicks in immediately.
      return;
    }
    prevIteration = tween._zTime;
    tween._zTime = totalTime || (suppressEvents ? tinyNum : 0); // when the playhead arrives at EXACTLY time 0 (right on top) of a zero-duration tween, we need to discern if events are suppressed so that when the playhead moves again (next time), it'll trigger the callback. If events are NOT suppressed, obviously the callback would be triggered in this render. Basically, the callback should fire either when the playhead ARRIVES or LEAVES this exact spot, not both. Imagine doing a timeline.seek(0) and there's a callback that sits at 0. Since events are suppressed on that seek() by default, nothing will fire, but when the playhead moves off of that position, the callback should fire. This behavior is what people intuitively expect.
    suppressEvents || (suppressEvents = totalTime && !prevIteration); // if it was rendered previously at exactly 0 (_zTime) and now the playhead is moving away, DON'T fire callbacks otherwise they'll seem like duplicates.
    tween.ratio = ratio;
    tween._from && (ratio = 1 - ratio);
    tween._time = 0;
    tween._tTime = tTime;
    pt = tween._pt;
    while (pt) {
      pt.r(ratio, pt.d);
      pt = pt._next;
    }
    tween._startAt &&
      totalTime < 0 &&
      tween._startAt.render(totalTime, true, true);
    tween._onUpdate && !suppressEvents && _callback(tween, 'onUpdate');
    tTime &&
      tween._repeat &&
      !suppressEvents &&
      tween.parent &&
      _callback(tween, 'onRepeat');
    if ((totalTime >= tween._tDur || totalTime < 0) && tween.ratio === ratio) {
      ratio && removeFromParent(tween, 1);
      if (!suppressEvents) {
        _callback(tween, ratio ? 'onComplete' : 'onReverseComplete', true);
        tween._prom && tween._prom();
      }
    }
  } else if (!tween._zTime) {
    tween._zTime = totalTime;
  }
};

const findNextPauseTween = (animation: any, prevTime: number, time: number) => {
  let child;
  if (time > prevTime) {
    child = animation._first;
    while (child && child._start <= time) {
      if (child.data === 'isPause' && child._start > prevTime) {
        return child;
      }
      child = child._next;
    }
  } else {
    child = animation._last;
    while (child && child._start >= time) {
      if (child.data === 'isPause' && child._start < prevTime) {
        return child;
      }
      child = child._prev;
    }
  }
};

const setDuration = (
  animation: any,
  duration: number,
  skipUncache?: boolean,
  leavePlayhead?: boolean
) => {
  let repeat = animation._repeat,
    dur = roundPrecise(duration) || 0,
    totalProgress = animation._tTime / animation._tDur;
  totalProgress && !leavePlayhead && (animation._time *= dur / animation._dur);
  animation._dur = dur;
  animation._tDur = !repeat
    ? dur
    : repeat < 0
    ? 1e10
    : roundPrecise(dur * (repeat + 1) + animation._rDelay * repeat);
  totalProgress > 0 && !leavePlayhead
    ? _alignPlayhead(
        animation,
        (animation._tTime = animation._tDur * totalProgress)
      )
    : animation.parent && setEnd(animation);
  skipUncache || uncache(animation.parent, animation);
  return animation;
};

const onUpdateTotalDuration = (animation: any) =>
  animation instanceof Timeline
    ? uncache(animation)
    : setDuration(animation, animation._dur);

const _zeroPosition = {
  _start: 0,
  endTime: emptyFunc,
  totalDuration: emptyFunc,
};

const parsePosition = (
  animation: any,
  position: any,
  percentAnimation: any
): any => {
  let labels = animation.labels;
  let recent = animation._recent || _zeroPosition;
  let clippedDuration =
    animation.duration() >= bigNum ? recent.endTime(false) : animation._dur; //in case there's a child that infinitely repeats, users almost never intend for the insertion point of a new child to be based on a SUPER long value like that so we clip it and assume the most recently-added child's endTime should be used instead.
  let i;
  let offset;
  let isPercent;

  if (isString(position) && (isNaN(position as any) || position in labels)) {
    //if the string is a number like "1", check to see if there's a label with that name, otherwise interpret it as a number (absolute value).
    offset = position.charAt(0);
    isPercent = position.substr(-1) === '%';
    i = position.indexOf('=');
    if (offset === '<' || offset === '>') {
      i >= 0 && (position = position.replace(/=/, ''));
      return (
        (offset === '<' ? recent._start : recent.endTime(recent._repeat >= 0)) +
        (parseFloat(position.substr(1)) || 0) *
          (isPercent
            ? (i < 0 ? recent : percentAnimation).totalDuration() / 100
            : 1)
      );
    }
    if (i < 0) {
      position in labels || (labels[position] = clippedDuration);
      return labels[position];
    }
    offset = parseFloat(position.charAt(i - 1) + position.substr(i + 1));
    if (isPercent && percentAnimation) {
      offset =
        (offset / 100) *
        (isArray(percentAnimation)
          ? percentAnimation[0]
          : percentAnimation
        ).totalDuration();
    }
    return i > 1
      ? parsePosition(animation, position.substr(0, i - 1), percentAnimation) +
          offset
      : clippedDuration + offset;
  }
  return position == null ? clippedDuration : +position;
};

export const createTweenType = (type: any, params: any, timeline: any) => {
  let isLegacy = isNumber(params[1]),
    varsIndex = (isLegacy ? 2 : 1) + (type < 2 ? 0 : 1),
    vars = params[varsIndex],
    irVars,
    parent;
  isLegacy && (vars.duration = params[1]);
  vars.parent = timeline;
  if (type) {
    irVars = vars;
    parent = timeline;
    while (parent && !('immediateRender' in irVars)) {
      // inheritance hasn't happened yet, but someone may have set a default in an ancestor timeline. We could do vars.immediateRender = _isNotFalse(_inheritDefaults(vars).immediateRender) but that'd exact a slight performance penalty because _inheritDefaults() also runs in the Tween constructor. We're paying a small kb price here to gain speed.
      irVars = parent.vars.defaults || {};
      parent = isNotFalse(parent.vars.inherit) && parent.parent;
    }
    vars.immediateRender = isNotFalse(irVars.immediateRender);
    type < 2 ? (vars.runBackwards = 1) : (vars.startAt = params[varsIndex - 1]); // "from" vars
  }
  return new Tween(params[0], vars, params[varsIndex + 1]);
};

const isArrayLike = (value: any, nonEmpty?: any) =>
  value &&
  isObject(value) &&
  'length' in value &&
  ((!nonEmpty && !value.length) ||
    (value.length - 1 in value && isObject(value[0]))) &&
  !value.nodeType &&
  value !== win;

const _flatten = (ar: any, leaveStrings: any, accumulator: any = []) =>
  ar.forEach((value: any) =>
    (isString(value) && !leaveStrings) || isArrayLike(value, 1)
      ? accumulator.push(...toArray(value))
      : accumulator.push(value)
  ) || accumulator;
//takes any value and returns an array. If it's a string (and leaveStrings isn't true), it'll use document.querySelectorAll() and convert that to an array. It'll also accept iterables like jQuery objects.

export const toArray = (value: any, scope?: any, leaveStrings?: any) =>
  isString(value) && !leaveStrings && (coreInitted || !wake())
    ? slice.call((scope || doc).querySelectorAll(value), 0)
    : isArray(value)
    ? _flatten(value, leaveStrings)
    : isArrayLike(value)
    ? slice.call(value, 0)
    : value
    ? [value]
    : [];

const selector = (value: any) => {
  value = toArray(value)[0] || warn('Invalid scope') || {};
  return (v: any) => {
    let el = value.current || value.nativeElement || value;
    return toArray(
      v,
      el.querySelectorAll
        ? el
        : el === value
        ? warn('Invalid scope') || doc.createElement('div')
        : value
    );
  };
};

const shuffle = (a: any) => a.sort(() => 0.5 - Math.random()); // alternative that's a bit faster and more reliably diverse but bigger:   for (let j, v, i = a.length; i; j = Math.floor(Math.random() * i), v = a[--i], a[i] = a[j], a[j] = v); return a;
//for distributing values across an array. Can accept a number, a function or (most commonly) a function which can contain the following properties: {base, amount, from, ease, grid, axis, length, each}. Returns a function that expects the following parameters: index, target, array. Recognizes the following

const distribute = (v: any): any => {
  if (isFunction(v)) {
    return v;
  }
  let vars = isObject(v) ? v : { each: v }, //n:1 is just to indicate v was a number; we leverage that later to set v according to the length we get. If a number is passed in, we treat it like the old stagger value where 0.1, for example, would mean that things would be distributed with 0.1 between each element in the array rather than a total "amount" that's chunked out among them all.
    ease = parseEase(vars.ease),
    from = vars.from || 0,
    base = parseFloat(vars.base) || 0,
    cache: any = {},
    isDecimal = from > 0 && from < 1,
    ratios = isNaN(from) || isDecimal,
    axis = vars.axis,
    ratioX = from,
    ratioY = from;
  if (isString(from)) {
    ratioX = ratioY = { center: 0.5, edges: 0.5, end: 1 }[from] || 0;
  } else if (!isDecimal && ratios) {
    ratioX = from[0];
    ratioY = from[1];
  }
  return (i: any, target: any, a: any) => {
    let l = (a || vars).length,
      distances = cache[l],
      originX,
      originY,
      x,
      y,
      d,
      j,
      max,
      min,
      wrapAt;
    if (!distances) {
      wrapAt = vars.grid === 'auto' ? 0 : (vars.grid || [1, bigNum])[1];
      if (!wrapAt) {
        max = -bigNum;
        while (
          max < (max = a[wrapAt++].getBoundingClientRect().left) &&
          wrapAt < l
        ) {}
        wrapAt--;
      }
      distances = cache[l] = [];
      originX = ratios ? Math.min(wrapAt, l) * ratioX - 0.5 : from % wrapAt;
      originY =
        wrapAt === bigNum
          ? 0
          : ratios
          ? (l * ratioY) / wrapAt - 0.5
          : (from / wrapAt) | 0;
      max = 0;
      min = bigNum;
      for (j = 0; j < l; j++) {
        x = (j % wrapAt) - originX;
        y = originY - ((j / wrapAt) | 0);
        distances[j] = d = !axis
          ? sqrt(x * x + y * y)
          : Math.abs(axis === 'y' ? y : x);
        d > max && (max = d);
        d < min && (min = d);
      }
      from === 'random' && shuffle(distances);
      distances.max = max - min;
      distances.min = min;
      distances.v = l =
        (parseFloat(vars.amount) ||
          parseFloat(vars.each) *
            (wrapAt > l
              ? l - 1
              : !axis
              ? Math.max(wrapAt, l / wrapAt)
              : axis === 'y'
              ? l / wrapAt
              : wrapAt) ||
          0) * (from === 'edges' ? -1 : 1);
      distances.b = l < 0 ? base - l : base;
      distances.u = getUnit(vars.amount || vars.each) || 0; //unit
      ease = ease && l < 0 ? invertEase(ease) : ease;
    }
    l = (distances[i] - distances.min) / distances.max || 0;
    return (
      roundPrecise(distances.b + (ease ? ease(l) : l) * distances.v) +
      distances.u
    ); //round in order to work around floating point errors
  };
};

const _roundModifier = (v: any) => {
  //pass in 0.1 get a function that'll round to the nearest tenth, or 5 to round to the closest 5, or 0.001 to the closest 1000th, etc.
  let p = Math.pow(10, ((v + '').split('.')[1] || '').length); //to avoid floating point math errors (like 24 * 0.1 == 2.4000000000000004), we chop off at a specific number of decimal places (much faster than toFixed())
  return (raw: any) => {
    let n = Math.round(parseFloat(raw) / v) * v * p;
    return (n - (n % 1)) / p + (isNumber(raw) ? 0 : getUnit(raw)); // n - n % 1 replaces Math.floor() in order to handle negative values properly. For example, Math.floor(-150.00000000000003) is 151!
  };
};

const snap = (snapTo: any, value: any) => {
  let _isArray = isArray(snapTo);
  let radius: any;
  let is2D: any;
  if (!_isArray && isObject(snapTo)) {
    radius = _isArray = snapTo.radius || bigNum;
    if (snapTo.values) {
      snapTo = toArray(snapTo.values);
      if ((is2D = !isNumber(snapTo[0]))) {
        radius *= radius; //performance optimization so we don't have to Math.sqrt() in the loop.
      }
    } else {
      snapTo = _roundModifier(snapTo.increment);
    }
  }
  return conditionalReturn(
    value,
    !_isArray
      ? _roundModifier(snapTo)
      : isFunction(snapTo)
      ? (raw: any) => {
          is2D = snapTo(raw);
          return Math.abs(is2D - raw) <= radius ? is2D : raw;
        }
      : (raw: any) => {
          let x = parseFloat(is2D ? raw.x : raw),
            y = parseFloat(is2D ? raw.y : 0),
            min = bigNum,
            closest = 0,
            i = snapTo.length,
            dx,
            dy;
          while (i--) {
            if (is2D) {
              dx = snapTo[i].x - x;
              dy = snapTo[i].y - y;
              dx = dx * dx + dy * dy;
            } else {
              dx = Math.abs(snapTo[i] - x);
            }
            if (dx < min) {
              min = dx;
              closest = i;
            }
          }
          closest = !radius || min <= radius ? snapTo[closest] : raw;
          return is2D || closest === raw || isNumber(raw)
            ? closest
            : closest + getUnit(raw);
        }
  );
};

const pipe =
  (...functions: any) =>
  (value: any) =>
    functions.reduce((v: any, f: any) => f(v), value);

const unitize = (func: any, unit: any) => (value: any) =>
  func(parseFloat(value)) + (unit || getUnit(value));

const normalize = (min: any, max: any, value: any) =>
  mapRange(min, max, 0, 1, value);

const _wrapArray = (a: any, wrapper: any, value: any) =>
  conditionalReturn(value, (index: any) => a[~~wrapper(index)]);

const wrap = function (min: any, max: any, value?: any): any {
  // NOTE: wrap() CANNOT be an arrow function! A very odd compiling bug causes problems (unrelated to GSAP).
  let range = max - min;
  return isArray(min)
    ? _wrapArray(min, wrap(0, min.length), max)
    : conditionalReturn(
        value,
        (value: any) => ((range + ((value - min) % range)) % range) + min
      );
};

const wrapYoyo = (min: any, max: any, value?: any): any => {
  let range = max - min,
    total = range * 2;
  return isArray(min)
    ? _wrapArray(min, wrapYoyo(0, min.length - 1), max)
    : conditionalReturn(value, (value: any) => {
        value = (total + ((value - min) % total)) % total || 0;
        return min + (value > range ? total - value : value);
      });
};

const mapRange = (
  inMin: any,
  inMax: any,
  outMin: any,
  outMax: any,
  value: any
) => {
  let inRange = inMax - inMin,
    outRange = outMax - outMin;
  return conditionalReturn(
    value,
    (value: any) => outMin + (((value - inMin) / inRange) * outRange || 0)
  );
};

const interpolate = (start: any, end: any, progress?: any, mutate?: any) => {
  let func = isNaN(start + end) ? 0 : (p: any) => (1 - p) * start + p * end;
  if (!func) {
    let _isString = isString(start);
    let master = {};
    let p;
    let i;
    let interpolators: any;
    let l: any;
    let il: any;

    progress === true && (mutate = 1) && (progress = null);

    if (_isString) {
      start = { p: start };
      end = { p: end };
    } else if (isArray(start) && !isArray(end)) {
      interpolators = [];
      l = start.length;
      il = l - 2;
      for (i = 1; i < l; i++) {
        interpolators.push(interpolate(start[i - 1], start[i])); //build the interpolators up front as a performance optimization so that when the function is called many times, it can just reuse them.
      }
      l--;
      func = (p) => {
        p *= l;
        let i = Math.min(il, ~~p);
        return interpolators[i](p - i);
      };
      progress = end;
    } else if (!mutate) {
      start = merge(isArray(start) ? [] : {}, start);
    }
    if (!interpolators) {
      for (p in end) {
        addPropTween.call(master, start, p, 'get', end[p]);
      }
      func = (p) => {
        renderPropTweens(p, master);
        return _isString ? start.p : start;
      };
    }
  }
  return conditionalReturn(progress, func);
};

const _getLabelInDirection = (timeline: any, fromTime: any, backward: any) => {
  //used for nextLabel() and previousLabel()
  let labels = timeline.labels,
    min = bigNum,
    p,
    distance,
    label;
  for (p in labels) {
    distance = labels[p] - fromTime;
    if (
      distance < 0 === !!backward &&
      distance &&
      min > (distance = Math.abs(distance))
    ) {
      label = p;
      min = distance;
    }
  }
  return label;
};

const _callback = (
  animation: any,
  type: string,
  executeLazyFirst?: boolean
) => {
  let v = animation.vars,
    callback = v[type],
    params,
    scope;
  if (!callback) {
    return;
  }
  params = v[type + 'Params'];
  scope = v.callbackScope || animation;
  executeLazyFirst && lazyTweens.length && _lazyRender(); //in case rendering caused any tweens to lazy-init, we should render them because typically when a timeline finishes, users expect things to have rendered fully. Imagine an onUpdate on a timeline that reports/checks tweened values.
  return params ? callback.apply(scope, params) : callback.call(scope);
};

const _interrupt = (animation: any) => {
  removeFromParent(animation);
  animation.scrollTrigger && animation.scrollTrigger.kill(false);
  animation.progress() < 1 && _callback(animation, 'onInterrupt');
  return animation;
};

let _quickTween: any;

//Initialization tasks
forEachName(
  callbackNames +
    'parent,duration,ease,delay,overwrite,runBackwards,startAt,yoyo,immediateRender,repeat,repeatDelay,data,paused,reversed,lazy,callbackScope,stringFilter,id,yoyoEase,stagger,inherit,repeatRefresh,keyframes,autoRevert,scrollTrigger',
  (name: any) => (reservedProps[name] = 1)
);

//register core plugins

// ! could be dropped with tree shaking
_gsap.registerPlugin(
  {
    name: 'attr',
    init(
      this: any,
      target: any,
      vars: any,
      tween: any,
      index: any,
      targets: any
    ) {
      let p, pt;
      for (p in vars) {
        pt = this.add(
          target,
          'setAttribute',
          (target.getAttribute(p) || 0) + '',
          vars[p],
          index,
          targets,
          0,
          0,
          p
        );
        pt && (pt.op = p);
        this._props.push(p);
      }
    },
  },
  {
    name: 'endArray',
    init(this: any, target: any, value: any) {
      let i = value.length;
      while (i--) {
        this.add(target, i, target[i] || 0, value[i]);
      }
    },
  },
  buildModifierPlugin('roundProps', _roundModifier),
  buildModifierPlugin('modifiers'),
  buildModifierPlugin('snap', snap)
);

export const gsap = _gsap;

Tween.version = Timeline.version = gsap.version = '3.10.4';
coreReady = 1;
windowExists() && wake();

export const {
  Power0,
  Power1,
  Power2,
  Power3,
  Power4,
  Linear,
  Quad,
  Cubic,
  Quart,
  Quint,
  Strong,
  Elastic,
  Back,
  SteppedEase,
  Bounce,
  Sine,
  Expo,
  Circ,
} = _easeMap;

export {
  Tween as TweenMax,
  Tween as TweenLite,
  Timeline as TimelineMax,
  Timeline as TimelineLite,
  gsap as default,
  wrap,
  wrapYoyo,
  distribute,
  random,
  snap,
  normalize,
  getUnit,
  clamp,
  splitColor,
  selector,
  mapRange,
  pipe,
  unitize,
  interpolate,
  shuffle,
};
//export some internal methods/orojects for use in CSSPlugin so that we can externalize that file and allow custom builds that exclude it.
export {
  getProperty,
  numExp,
  numWithUnitExp,
  isString,
  isUndefined,
  renderComplexString,
  relExp,
  setDefaults,
  removeLinkedListItem,
  forEachName,
  sortPropTweensByPriority,
  colorStringFilter,
  replaceRandom,
  checkPlugin,
  plugins,
  ticker,
  config,
  roundModifier,
  round,
  missingPlugin,
  getSetter,
  getCache,
  colorExp,
  parseRelative,
};
