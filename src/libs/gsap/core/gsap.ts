/*
 * --------------------------------------------------------------------------------------
 * GSAP
 * --------------------------------------------------------------------------------------
 */
import { createPlugin } from './createPlugin';
import { globals } from './globals';
import { Timeline } from './timeline';
import { Tween } from './tween';
import { forEachName, warn } from './utils';

export const _gsap = {
  version: '',
  registerPlugin(...args: {}[]) {
    args.forEach((config: any) => createPlugin(config));
  },
  timeline(vars) {
    return new Timeline(vars);
  },
  getTweensOf(targets, onlyActive) {
    return _globalTimeline.getTweensOf(targets, onlyActive);
  },
  getProperty(target, property, unit, uncache) {
    _isString(target) && (target = toArray(target)[0]); //in case selector text or an array is passed in
    let getter = _getCache(target || {}).get,
      format = unit ? _passThrough : _numericIfPossible;
    unit === 'native' && (unit = '');
    return !target
      ? target
      : !property
      ? (property, unit, uncache) =>
          format(
            ((_plugins[property] && _plugins[property].get) || getter)(
              target,
              property,
              unit,
              uncache
            )
          )
      : format(
          ((_plugins[property] && _plugins[property].get) || getter)(
            target,
            property,
            unit,
            uncache
          )
        );
  },
  quickSetter(target, property, unit) {
    target = toArray(target);
    if (target.length > 1) {
      let setters = target.map((t) => gsap.quickSetter(t, property, unit)),
        l = setters.length;
      return (value) => {
        let i = l;
        while (i--) {
          setters[i](value);
        }
      };
    }
    target = target[0] || {};
    let Plugin = plugins[property],
      cache = _getCache(target),
      p =
        (cache.harness && (cache.harness.aliases || {})[property]) || property, // in case it's an alias, like "rotate" for "rotation".
      setter = Plugin
        ? (value) => {
            let p = new Plugin();
            _quickTween._pt = 0;
            p.init(target, unit ? value + unit : value, _quickTween, 0, [
              target,
            ]);
            p.render(1, p);
            _quickTween._pt && _renderPropTweens(1, _quickTween);
          }
        : cache.set(target, p);
    return Plugin
      ? setter
      : (value) => setter(target, p, unit ? value + unit : value, cache, 1);
  },
  quickTo(target, property, vars) {
    let tween = gsap.to(
        target,
        _merge({ [property]: '+=0.1', paused: true }, vars || {})
      ),
      func = (value, start, startIsRelative) =>
        tween.resetTo(property, value, start, startIsRelative);
    func.tween = tween;
    return func;
  },
  isTweening(targets) {
    return _globalTimeline.getTweensOf(targets, true).length > 0;
  },
  defaults(value) {
    value &&
      value.ease &&
      (value.ease = _parseEase(value.ease, _defaults.ease));
    return _mergeDeep(_defaults, value || {});
  },
  config(value) {
    return _mergeDeep(_config, value || {});
  },
  registerEffect({ name, effect, plugins, defaults, extendTimeline }) {
    (plugins || '')
      .split(',')
      .forEach(
        (pluginName) =>
          pluginName &&
          !_plugins[pluginName] &&
          !globals[pluginName] &&
          warn(name + ' effect requires ' + pluginName + ' plugin.')
      );
    _effects[name] = (targets, vars, tl) =>
      effect(toArray(targets), _setDefaults(vars || {}, defaults), tl);
    if (extendTimeline) {
      Timeline.prototype[name] = function (targets, vars, position) {
        return this.add(
          _effects[name](
            targets,
            _isObject(vars) ? vars : (position = vars) && {},
            this
          ),
          position
        );
      };
    }
  },
  registerEase(name, ease) {
    _easeMap[name] = _parseEase(ease);
  },
  parseEase(ease, defaultEase) {
    return arguments.length ? _parseEase(ease, defaultEase) : _easeMap;
  },
  getById(id) {
    return _globalTimeline.getById(id);
  },
  exportRoot(vars = {}, includeDelayedCalls) {
    let tl = new Timeline(vars),
      child,
      next;
    tl.smoothChildTiming = _isNotFalse(vars.smoothChildTiming);
    _globalTimeline.remove(tl);
    tl._dp = 0; //otherwise it'll get re-activated when adding children and be re-introduced into _globalTimeline's linked list (then added to itself).
    tl._time = tl._tTime = _globalTimeline._time;
    child = _globalTimeline._first;
    while (child) {
      next = child._next;
      if (
        includeDelayedCalls ||
        !(
          !child._dur &&
          child instanceof Tween &&
          child.vars.onComplete === child._targets[0]
        )
      ) {
        _addToTimeline(tl, child, child._start - child._delay);
      }
      child = next;
    }
    _addToTimeline(_globalTimeline, tl, 0);
    return tl;
  },
  utils: {
    wrap,
    wrapYoyo,
    distribute,
    random,
    snap,
    normalize,
    getUnit,
    clamp,
    splitColor,
    toArray,
    selector,
    mapRange,
    pipe,
    unitize,
    interpolate,
    shuffle,
  },
  install: _install,
  effects: _effects,
  ticker: _ticker,
  updateRoot: Timeline.updateRoot,
  plugins: _plugins,
  globalTimeline: _globalTimeline,
  core: {
    PropTween,
    globals: _addGlobal,
    Tween,
    Timeline,
    Animation,
    getCache: _getCache,
    _removeLinkedListItem,
    suppressOverwrites: (value) => (_suppressOverwrites = value),
  },
};

forEachName(
  'to,from,fromTo,delayedCall,set,killTweensOf',
  (name: any) => (_gsap[name] = Tween[name])
);

_ticker.add(Timeline.updateRoot);
_quickTween = _gsap.to({}, { duration: 0 });
