/*
 * --------------------------------------------------------------------------------------
 * TWEEN
 * --------------------------------------------------------------------------------------
 */
import { config } from './config';
import {
  addToTimeline,
  distribute,
  globalTimeline,
  inheritDefaults,
  toArray,
} from './core';
import { _easeMap, parseEase } from './easing';
import { harness } from './harness';
import {
  parseFuncOrString,
  parseKeyframe,
  staggerPropsToSkip,
  staggerTweenProps,
  Timeline,
} from './timeline';
import {
  copyExcluding,
  forEachName,
  hasNoPausedAncestors,
  isArray,
  isFuncOrString,
  isNotFalse,
  isNumber,
  isObject,
  isTypedArray,
  merge,
  roundPrecise,
  setDefaults,
  slice,
  tinyNum,
  warn,
} from './utils';

let suppressOverwrites: any;

export class Tween extends Animation {
  static version = '';

  _targets: any;
  _ptLookup: any;
  _overwrite: any;
  _delay: any;
  _start: any;
  timeline: any;
  duration: any;
  _tTime: any;
  paused: any;

  vars: any;

  constructor(targets: any[], vars: any, position?: any, skipInherit?: any) {
    if (typeof vars === 'number') {
      position.duration = vars;
      vars = position;
      position = null;
    }

    super(skipInherit ? vars : inheritDefaults(vars));

    let {
      duration,
      delay,
      immediateRender,
      stagger,
      overwrite,
      keyframes,
      defaults,
      scrollTrigger,
      yoyoEase,
    } = this.vars;

    const parent = vars.parent || globalTimeline;
    const parsedTargets: any[] = (
      (
        isArray(targets) || isTypedArray(targets)
          ? isNumber(targets[0])
          : 'length' in vars
      )
        ? [targets]
        : toArray(targets as any)
    ) as any[]; // edge case: someone might try animating the "length" of an object with a "length" property that's initially set to 0 so don't interpret that as an empty Array-like object.
    let tl: any;
    let i: any;
    let copy: any;
    let l: any;
    let p: any;
    let curTarget: any;
    let staggerFunc: any;
    let staggerVarsToMerge: any;

    this._targets = parsedTargets.length
      ? harness(parsedTargets)
      : warn(
          'GSAP target ' + targets + ' not found. https://greensock.com',
          !config.nullTargetWarn
        ) || [];
    this._ptLookup = []; //PropTween lookup. An array containing an object for each target, having keys for each tweening property
    this._overwrite = overwrite;

    if (
      keyframes ||
      stagger ||
      isFuncOrString(duration) ||
      isFuncOrString(delay)
    ) {
      vars = this.vars;
      tl = this.timeline = new Timeline({
        data: 'nested',
        defaults: defaults || {},
      });
      tl.kill();
      tl.parent = tl._dp = this;
      tl._start = 0;
      if (stagger || isFuncOrString(duration) || isFuncOrString(delay)) {
        l = parsedTargets.length;
        staggerFunc = stagger && distribute(stagger);
        if (isObject(stagger)) {
          //users can pass in callbacks like onStart/onComplete in the stagger object. These should fire with each individual tween.
          for (p in stagger) {
            if (~staggerTweenProps.indexOf(p)) {
              staggerVarsToMerge || (staggerVarsToMerge = {});
              staggerVarsToMerge[p] = stagger[p];
            }
          }
        }
        for (i = 0; i < l; i++) {
          copy = copyExcluding(vars, staggerPropsToSkip);
          copy.stagger = 0;
          yoyoEase && (copy.yoyoEase = yoyoEase);
          staggerVarsToMerge && merge(copy, staggerVarsToMerge);
          curTarget = parsedTargets[i];
          //don't just copy duration or delay because if they're a string or function, we'd end up in an infinite loop because _isFuncOrString() would evaluate as true in the child tweens, entering this loop, etc. So we parse the value straight from vars and default to 0.
          copy.duration = +parseFuncOrString(
            duration,
            this,
            i,
            curTarget,
            parsedTargets
          );
          copy.delay =
            (+parseFuncOrString(delay, this, i, curTarget, parsedTargets) ||
              0) - this._delay;

          if (!stagger && l === 1 && copy.delay) {
            // if someone does delay:"random(1, 5)", repeat:-1, for example, the delay shouldn't be inside the repeat.
            this._delay = delay = copy.delay;
            this._start += delay;
            copy.delay = 0;
          }
          tl.to(
            curTarget,
            copy,
            staggerFunc ? staggerFunc(i, curTarget, parsedTargets) : 0
          );
          tl._ease = _easeMap.none;
        }
        tl.duration() ? (duration = delay = 0) : (this.timeline = 0); // if the timeline's duration is 0, we don't need a timeline internally!
      } else if (keyframes) {
        inheritDefaults(setDefaults(tl.vars.defaults, { ease: 'none' }));
        tl._ease = parseEase(keyframes.ease || vars.ease || 'none');
        let time = 0,
          a: any,
          kf: any,
          v: any;
        if (isArray(keyframes)) {
          keyframes.forEach((frame) => tl.to(parsedTargets, frame, '>'));
        } else {
          copy = {};
          for (p in keyframes) {
            p === 'ease' ||
              p === 'easeEach' ||
              parseKeyframe(p, keyframes[p], copy, keyframes.easeEach);
          }
          for (p in copy) {
            a = copy[p].sort((a: any, b: any) => a.t - b.t);
            time = 0;
            for (i = 0; i < a.length; i++) {
              kf = a[i];
              v = {
                ease: kf.e,
                duration: ((kf.t - (i ? a[i - 1].t : 0)) / 100) * duration,
              };
              v[p] = kf.v;
              tl.to(parsedTargets, v, time);
              time += v.duration;
            }
          }
          tl.duration() < duration &&
            tl.to({}, { duration: duration - tl.duration() }); // in case keyframes didn't go to 100%
        }
      }
      duration || this.duration((duration = tl.duration()));
    } else {
      this.timeline = 0; //speed optimization, faster lookups (no going up the prototype chain)
    }

    if (overwrite === true && !suppressOverwrites) {
      _overwritingTween = this;
      globalTimeline.killTweensOf(parsedTargets);
      _overwritingTween = 0;
    }
    addToTimeline(parent, this, position);

    vars.reversed && this.reverse();
    vars.paused && this.paused(true);
    if (
      immediateRender ||
      (!duration &&
        !keyframes &&
        this._start === roundPrecise(parent._time) &&
        isNotFalse(immediateRender) &&
        hasNoPausedAncestors(this) &&
        parent.data !== 'nested')
    ) {
      this._tTime = -tinyNum; //forces a render without having to set the render() "force" parameter to true because we want to allow lazying by default (using the "force" parameter always forces an immediate full render)
      this.render(Math.max(0, -delay)); //in case delay is negative
    }

    scrollTrigger && scrollTrigger(this, scrollTrigger);
  }

  render(totalTime: any, suppressEvents?: any, force?: any) {
    let prevTime = this._time,
      tDur = this._tDur,
      dur = this._dur,
      tTime =
        totalTime > tDur - _tinyNum && totalTime >= 0
          ? tDur
          : totalTime < _tinyNum
          ? 0
          : totalTime,
      time,
      pt,
      iteration,
      cycleDuration,
      prevIteration,
      isYoyo,
      ratio,
      timeline,
      yoyoEase;
    if (!dur) {
      _renderZeroDurationTween(this, totalTime, suppressEvents, force);
    } else if (
      tTime !== this._tTime ||
      !totalTime ||
      force ||
      (!this._initted && this._tTime) ||
      (this._startAt && this._zTime < 0 !== totalTime < 0)
    ) {
      //this senses if we're crossing over the start time, in which case we must record _zTime and force the render, but we do it in this lengthy conditional way for performance reasons (usually we can skip the calculations): this._initted && (this._zTime < 0) !== (totalTime < 0)
      time = tTime;
      timeline = this.timeline;
      if (this._repeat) {
        //adjust the time for repeats and yoyos
        cycleDuration = dur + this._rDelay;
        if (this._repeat < -1 && totalTime < 0) {
          return this.totalTime(
            cycleDuration * 100 + totalTime,
            suppressEvents,
            force
          );
        }
        time = _roundPrecise(tTime % cycleDuration); //round to avoid floating point errors. (4 % 0.8 should be 0 but some browsers report it as 0.79999999!)
        if (tTime === tDur) {
          // the tDur === tTime is for edge cases where there's a lengthy decimal on the duration and it may reach the very end but the time is rendered as not-quite-there (remember, tDur is rounded to 4 decimals whereas dur isn't)
          iteration = this._repeat;
          time = dur;
        } else {
          iteration = ~~(tTime / cycleDuration);
          if (iteration && iteration === tTime / cycleDuration) {
            time = dur;
            iteration--;
          }
          time > dur && (time = dur);
        }
        isYoyo = this._yoyo && iteration & 1;
        if (isYoyo) {
          yoyoEase = this._yEase;
          time = dur - time;
        }
        prevIteration = _animationCycle(this._tTime, cycleDuration);
        if (time === prevTime && !force && this._initted) {
          //could be during the repeatDelay part. No need to render and fire callbacks.
          this._tTime = tTime;
          return this;
        }
        if (iteration !== prevIteration) {
          timeline && this._yEase && _propagateYoyoEase(timeline, isYoyo);
          //repeatRefresh functionality
          if (this.vars.repeatRefresh && !isYoyo && !this._lock) {
            this._lock = force = 1; //force, otherwise if lazy is true, the _attemptInitTween() will return and we'll jump out and get caught bouncing on each tick.
            this.render(
              _roundPrecise(cycleDuration * iteration),
              true
            ).invalidate()._lock = 0;
          }
        }
      }

      if (!this._initted) {
        if (
          _attemptInitTween(
            this,
            totalTime < 0 ? totalTime : time,
            force,
            suppressEvents
          )
        ) {
          this._tTime = 0; // in constructor if immediateRender is true, we set _tTime to -_tinyNum to have the playhead cross the starting point but we can't leave _tTime as a negative number.
          return this;
        }
        if (prevTime !== this._time) {
          // rare edge case - during initialization, an onUpdate in the _startAt (.fromTo()) might force this tween to render at a different spot in which case we should ditch this render() call so that it doesn't revert the values.
          return this;
        }
        if (dur !== this._dur) {
          // while initting, a plugin like InertiaPlugin might alter the duration, so rerun from the start to ensure everything renders as it should.
          return this.render(totalTime, suppressEvents, force);
        }
      }

      this._tTime = tTime;
      this._time = time;

      if (!this._act && this._ts) {
        this._act = 1; //as long as it's not paused, force it to be active so that if the user renders independent of the parent timeline, it'll be forced to re-render on the next tick.
        this._lazy = 0;
      }

      this.ratio = ratio = (yoyoEase || this._ease)(time / dur);
      if (this._from) {
        this.ratio = ratio = 1 - ratio;
      }

      if (time && !prevTime && !suppressEvents) {
        _callback(this, 'onStart');
        if (this._tTime !== tTime) {
          // in case the onStart triggered a render at a different spot, eject. Like if someone did animation.pause(0.5) or something inside the onStart.
          return this;
        }
      }
      pt = this._pt;
      while (pt) {
        pt.r(ratio, pt.d);
        pt = pt._next;
      }
      (timeline &&
        timeline.render(
          totalTime < 0
            ? totalTime
            : !time && isYoyo
            ? -_tinyNum
            : timeline._dur * timeline._ease(time / this._dur),
          suppressEvents,
          force
        )) ||
        (this._startAt && (this._zTime = totalTime));

      if (this._onUpdate && !suppressEvents) {
        totalTime < 0 &&
          this._startAt &&
          this._startAt.render(totalTime, true, force); //note: for performance reasons, we tuck this conditional logic inside less traveled areas (most tweens don't have an onUpdate). We'd just have it at the end before the onComplete, but the values should be updated before any onUpdate is called, so we ALSO put it here and then if it's not called, we do so later near the onComplete.
        _callback(this, 'onUpdate');
      }

      this._repeat &&
        iteration !== prevIteration &&
        this.vars.onRepeat &&
        !suppressEvents &&
        this.parent &&
        _callback(this, 'onRepeat');

      if ((tTime === this._tDur || !tTime) && this._tTime === tTime) {
        totalTime < 0 &&
          this._startAt &&
          !this._onUpdate &&
          this._startAt.render(totalTime, true, true);
        (totalTime || !dur) &&
          ((tTime === this._tDur && this._ts > 0) ||
            (!tTime && this._ts < 0)) &&
          _removeFromParent(this, 1); // don't remove if we're rendering at exactly a time of 0, as there could be autoRevert values that should get set on the next tick (if the playhead goes backward beyond the startTime, negative totalTime). Don't remove if the timeline is reversed and the playhead isn't at 0, otherwise tl.progress(1).reverse() won't work. Only remove if the playhead is at the end and timeScale is positive, or if the playhead is at 0 and the timeScale is negative.
        if (
          !suppressEvents &&
          !(totalTime < 0 && !prevTime) &&
          (tTime || prevTime)
        ) {
          // if prevTime and tTime are zero, we shouldn't fire the onReverseComplete. This could happen if you gsap.to(... {paused:true}).play();
          _callback(
            this,
            tTime === tDur ? 'onComplete' : 'onReverseComplete',
            true
          );
          this._prom && !(tTime < tDur && this.timeScale() > 0) && this._prom();
        }
      }
    }
    return this;
  }

  targets() {
    return this._targets;
  }

  invalidate() {
    this._pt =
      this._op =
      this._startAt =
      this._onUpdate =
      this._lazy =
      this.ratio =
        0;
    this._ptLookup = [];
    this.timeline && this.timeline.invalidate();
    return super.invalidate();
  }

  resetTo(property, value, start, startIsRelative) {
    _tickerActive || _ticker.wake();
    this._ts || this.play();
    let time = Math.min(this._dur, (this._dp._time - this._start) * this._ts),
      ratio;
    this._initted || _initTween(this, time);
    ratio = this._ease(time / this._dur); // don't just get tween.ratio because it may not have rendered yet.
    // possible future addition to allow an object with multiple values to update, like tween.resetTo({x: 100, y: 200}); At this point, it doesn't seem worth the added kb given the fact that most users will likely opt for the convenient gsap.quickTo() way of interacting with this method.
    // if (_isObject(property)) { // performance optimization
    // 	for (p in property) {
    // 		if (_updatePropTweens(this, p, property[p], value ? value[p] : null, start, ratio, time)) {
    // 			return this.resetTo(property, value, start, startIsRelative); // if a PropTween wasn't found for the property, it'll get forced with a re-initialization so we need to jump out and start over again.
    // 		}
    // 	}
    // } else {
    if (
      _updatePropTweens(
        this,
        property,
        value,
        start,
        startIsRelative,
        ratio,
        time
      )
    ) {
      return this.resetTo(property, value, start, startIsRelative); // if a PropTween wasn't found for the property, it'll get forced with a re-initialization so we need to jump out and start over again.
    }
    //}
    _alignPlayhead(this, 0);
    this.parent ||
      _addLinkedListItem(
        this._dp,
        this,
        '_first',
        '_last',
        this._dp._sort ? '_start' : 0
      );
    return this.render(0);
  }

  kill(targets, vars = 'all') {
    if (!targets && (!vars || vars === 'all')) {
      this._lazy = this._pt = 0;
      return this.parent ? _interrupt(this) : this;
    }
    if (this.timeline) {
      let tDur = this.timeline.totalDuration();
      this.timeline.killTweensOf(
        targets,
        vars,
        _overwritingTween && _overwritingTween.vars.overwrite !== true
      )._first || _interrupt(this); // if nothing is left tweening, interrupt.
      this.parent &&
        tDur !== this.timeline.totalDuration() &&
        _setDuration(this, (this._dur * this.timeline._tDur) / tDur, 0, 1); // if a nested tween is killed that changes the duration, it should affect this tween's duration. We must use the ratio, though, because sometimes the internal timeline is stretched like for keyframes where they don't all add up to whatever the parent tween's duration was set to.
      return this;
    }
    let parsedTargets = this._targets,
      killingTargets = targets ? toArray(targets) : parsedTargets,
      propTweenLookup = this._ptLookup,
      firstPT = this._pt,
      overwrittenProps,
      curLookup,
      curOverwriteProps,
      props,
      p,
      pt,
      i;
    if (
      (!vars || vars === 'all') &&
      _arraysMatch(parsedTargets, killingTargets)
    ) {
      vars === 'all' && (this._pt = 0);
      return _interrupt(this);
    }
    overwrittenProps = this._op = this._op || [];
    if (vars !== 'all') {
      //so people can pass in a comma-delimited list of property names
      if (_isString(vars)) {
        p = {};
        _forEachName(vars, (name) => (p[name] = 1));
        vars = p;
      }
      vars = _addAliasesToVars(parsedTargets, vars);
    }
    i = parsedTargets.length;
    while (i--) {
      if (~killingTargets.indexOf(parsedTargets[i])) {
        curLookup = propTweenLookup[i];
        if (vars === 'all') {
          overwrittenProps[i] = vars;
          props = curLookup;
          curOverwriteProps = {};
        } else {
          curOverwriteProps = overwrittenProps[i] = overwrittenProps[i] || {};
          props = vars;
        }
        for (p in props) {
          pt = curLookup && curLookup[p];
          if (pt) {
            if (!('kill' in pt.d) || pt.d.kill(p) === true) {
              _removeLinkedListItem(this, pt, '_pt');
            }
            delete curLookup[p];
          }
          if (curOverwriteProps !== 'all') {
            curOverwriteProps[p] = 1;
          }
        }
      }
    }
    this._initted && !this._pt && firstPT && _interrupt(this); //if all tweening properties are killed, kill the tween. Without this line, if there's a tween with multiple targets and then you killTweensOf() each target individually, the tween would technically still remain active and fire its onComplete even though there aren't any more properties tweening.
    return this;
  }

  static to(targets: any, vars: any) {
    return new Tween(targets, vars, arguments[2]);
  }

  static from(targets, vars) {
    return _createTweenType(1, arguments);
  }

  static delayedCall(delay, callback, params, scope) {
    return new Tween(callback, 0, {
      immediateRender: false,
      lazy: false,
      overwrite: false,
      delay: delay,
      onComplete: callback,
      onReverseComplete: callback,
      onCompleteParams: params,
      onReverseCompleteParams: params,
      callbackScope: scope,
    });
  }

  static fromTo(targets, fromVars, toVars) {
    return _createTweenType(2, arguments);
  }

  static set(targets, vars) {
    vars.duration = 0;
    vars.repeatDelay || (vars.repeat = 0);
    return new Tween(targets, vars);
  }

  static killTweensOf(targets, props, onlyActive) {
    return _globalTimeline.killTweensOf(targets, props, onlyActive);
  }
}

setDefaults(Tween.prototype, {
  _targets: [],
  _lazy: 0,
  _startAt: 0,
  _op: 0,
  _onInit: 0,
});

//add the pertinent timeline methods to Tween instances so that users can chain conveniently and create a timeline automatically. (removed due to concerns that it'd ultimately add to more confusion especially for beginners)
// _forEachName("to,from,fromTo,set,call,add,addLabel,addPause", name => {
// 	Tween.prototype[name] = function() {
// 		let tl = new Timeline();
// 		return _addToTimeline(tl, this)[name].apply(tl, toArray(arguments));
// 	}
// });

//for backward compatibility. Leverage the timeline calls.
forEachName('staggerTo,staggerFrom,staggerFromTo', (name: string) => {
  Tween[name] = function () {
    let tl = new Timeline();
    let params = slice.call(arguments, 0);
    params.splice(name === 'staggerFromTo' ? 5 : 4, 0, 0);
    return tl[name].apply(tl, params);
  };
});
