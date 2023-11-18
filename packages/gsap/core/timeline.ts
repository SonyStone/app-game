/*
 * -------------------------------------------------
 * TIMELINE
 * -------------------------------------------------
 */

import { config } from './config';
import {
  addToTimeline,
  callbackNames,
  createTweenType,
  getCache,
  globalTimeline,
  scrollTrigger,
} from './core';
import { reservedProps } from './createPlugin';
import { invertEase, parseEase } from './easing';
import {
  PropTween,
  renderBoolean,
  renderPlain,
  setterFunc,
  setterFuncWithParam,
  setterPlain,
} from './proptween';
import { Tween } from './tween';
import {
  copyExcluding,
  forEachName,
  getUnit,
  isArray,
  isFunction,
  isNotFalse,
  isString,
  missingPlugin,
  parseRelative,
  removeFromParent,
  replaceRandom,
  setDefaults,
  tinyNum,
} from './utils';

export class Timeline extends Animation {
  static version = '';

  labels = {};
  smoothChildTiming = !!this.vars.smoothChildTiming;
  autoRemoveChildren = !!this.vars.autoRemoveChildren;
  _sort = isNotFalse(this.vars.sortChildren);

  constructor(private readonly vars: any = {}, position?: any) {
    super(vars);

    globalTimeline &&
      addToTimeline(vars.parent || globalTimeline, this, position);
    vars.reversed && this.reverse();
    vars.paused && this.paused(true);
    vars.scrollTrigger && scrollTrigger(this, vars.scrollTrigger);
  }

  to(targets, vars, position) {
    createTweenType(0, arguments, this);
    return this;
  }

  from(targets, vars, position) {
    createTweenType(1, arguments, this);
    return this;
  }

  fromTo(targets, fromVars, toVars, position) {
    createTweenType(2, arguments, this);
    return this;
  }

  set(targets, vars, position) {
    vars.duration = 0;
    vars.parent = this;
    _inheritDefaults(vars).repeatDelay || (vars.repeat = 0);
    vars.immediateRender = !!vars.immediateRender;
    new Tween(targets, vars, _parsePosition(this, position), 1);
    return this;
  }

  call(callback, params, position) {
    return _addToTimeline(
      this,
      Tween.delayedCall(0, callback, params),
      position
    );
  }

  //ONLY for backward compatibility! Maybe delete?
  staggerTo(
    targets,
    duration,
    vars,
    stagger,
    position,
    onCompleteAll,
    onCompleteAllParams
  ) {
    vars.duration = duration;
    vars.stagger = vars.stagger || stagger;
    vars.onComplete = onCompleteAll;
    vars.onCompleteParams = onCompleteAllParams;
    vars.parent = this;
    new Tween(targets, vars, _parsePosition(this, position));
    return this;
  }

  staggerFrom(
    targets,
    duration,
    vars,
    stagger,
    position,
    onCompleteAll,
    onCompleteAllParams
  ) {
    vars.runBackwards = 1;
    _inheritDefaults(vars).immediateRender = _isNotFalse(vars.immediateRender);
    return this.staggerTo(
      targets,
      duration,
      vars,
      stagger,
      position,
      onCompleteAll,
      onCompleteAllParams
    );
  }

  staggerFromTo(
    targets,
    duration,
    fromVars,
    toVars,
    stagger,
    position,
    onCompleteAll,
    onCompleteAllParams
  ) {
    toVars.startAt = fromVars;
    _inheritDefaults(toVars).immediateRender = _isNotFalse(
      toVars.immediateRender
    );
    return this.staggerTo(
      targets,
      duration,
      toVars,
      stagger,
      position,
      onCompleteAll,
      onCompleteAllParams
    );
  }

  render(totalTime, suppressEvents, force) {
    let prevTime = this._time,
      tDur = this._dirty ? this.totalDuration() : this._tDur,
      dur = this._dur,
      tTime = totalTime <= 0 ? 0 : _roundPrecise(totalTime), // if a paused timeline is resumed (or its _start is updated for another reason...which rounds it), that could result in the playhead shifting a **tiny** amount and a zero-duration child at that spot may get rendered at a different ratio, like its totalTime in render() may be 1e-17 instead of 0, for example.
      crossingStart =
        this._zTime < 0 !== totalTime < 0 && (this._initted || !dur),
      time,
      child,
      next,
      iteration,
      cycleDuration,
      prevPaused,
      pauseTween,
      timeScale,
      prevStart,
      prevIteration,
      yoyo,
      isYoyo;
    this !== _globalTimeline &&
      tTime > tDur &&
      totalTime >= 0 &&
      (tTime = tDur);
    if (tTime !== this._tTime || force || crossingStart) {
      if (prevTime !== this._time && dur) {
        //if totalDuration() finds a child with a negative startTime and smoothChildTiming is true, things get shifted around internally so we need to adjust the time accordingly. For example, if a tween starts at -30 we must shift EVERYTHING forward 30 seconds and move this timeline's startTime backward by 30 seconds so that things align with the playhead (no jump).
        tTime += this._time - prevTime;
        totalTime += this._time - prevTime;
      }
      time = tTime;
      prevStart = this._start;
      timeScale = this._ts;
      prevPaused = !timeScale;
      if (crossingStart) {
        dur || (prevTime = this._zTime);
        //when the playhead arrives at EXACTLY time 0 (right on top) of a zero-duration timeline, we need to discern if events are suppressed so that when the playhead moves again (next time), it'll trigger the callback. If events are NOT suppressed, obviously the callback would be triggered in this render. Basically, the callback should fire either when the playhead ARRIVES or LEAVES this exact spot, not both. Imagine doing a timeline.seek(0) and there's a callback that sits at 0. Since events are suppressed on that seek() by default, nothing will fire, but when the playhead moves off of that position, the callback should fire. This behavior is what people intuitively expect.
        (totalTime || !suppressEvents) && (this._zTime = totalTime);
      }
      if (this._repeat) {
        //adjust the time for repeats and yoyos
        yoyo = this._yoyo;
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
        prevIteration = _animationCycle(this._tTime, cycleDuration);
        !prevTime &&
          this._tTime &&
          prevIteration !== iteration &&
          (prevIteration = iteration); // edge case - if someone does addPause() at the very beginning of a repeating timeline, that pause is technically at the same spot as the end which causes this._time to get set to 0 when the totalTime would normally place the playhead at the end. See https://greensock.com/forums/topic/23823-closing-nav-animation-not-working-on-ie-and-iphone-6-maybe-other-older-browser/?tab=comments#comment-113005
        if (yoyo && iteration & 1) {
          time = dur - time;
          isYoyo = 1;
        }
        /*
        make sure children at the end/beginning of the timeline are rendered properly. If, for example,
        a 3-second long timeline rendered at 2.9 seconds previously, and now renders at 3.2 seconds (which
        would get translated to 2.8 seconds if the timeline yoyos or 0.2 seconds if it just repeats), there
        could be a callback or a short tween that's at 2.95 or 3 seconds in which wouldn't render. So
        we need to push the timeline to the end (and/or beginning depending on its yoyo value). Also we must
        ensure that zero-duration tweens at the very beginning or end of the Timeline work.
        */
        if (iteration !== prevIteration && !this._lock) {
          let rewinding = yoyo && prevIteration & 1,
            doesWrap = rewinding === (yoyo && iteration & 1);
          iteration < prevIteration && (rewinding = !rewinding);
          prevTime = rewinding ? 0 : dur;
          this._lock = 1;
          this.render(
            prevTime || (isYoyo ? 0 : _roundPrecise(iteration * cycleDuration)),
            suppressEvents,
            !dur
          )._lock = 0;
          this._tTime = tTime; // if a user gets the iteration() inside the onRepeat, for example, it should be accurate.
          !suppressEvents && this.parent && _callback(this, 'onRepeat');
          this.vars.repeatRefresh && !isYoyo && (this.invalidate()._lock = 1);
          if (
            (prevTime && prevTime !== this._time) ||
            prevPaused !== !this._ts ||
            (this.vars.onRepeat && !this.parent && !this._act)
          ) {
            // if prevTime is 0 and we render at the very end, _time will be the end, thus won't match. So in this edge case, prevTime won't match _time but that's okay. If it gets killed in the onRepeat, eject as well.
            return this;
          }
          dur = this._dur; // in case the duration changed in the onRepeat
          tDur = this._tDur;
          if (doesWrap) {
            this._lock = 2;
            prevTime = rewinding ? dur : -0.0001;
            this.render(prevTime, true);
            this.vars.repeatRefresh && !isYoyo && this.invalidate();
          }
          this._lock = 0;
          if (!this._ts && !prevPaused) {
            return this;
          }
          //in order for yoyoEase to work properly when there's a stagger, we must swap out the ease in each sub-tween.
          _propagateYoyoEase(this, isYoyo);
        }
      }
      if (this._hasPause && !this._forcing && this._lock < 2) {
        pauseTween = _findNextPauseTween(
          this,
          _roundPrecise(prevTime),
          _roundPrecise(time)
        );
        if (pauseTween) {
          tTime -= time - (time = pauseTween._start);
        }
      }

      this._tTime = tTime;
      this._time = time;
      this._act = !timeScale; //as long as it's not paused, force it to be active so that if the user renders independent of the parent timeline, it'll be forced to re-render on the next tick.

      if (!this._initted) {
        this._onUpdate = this.vars.onUpdate;
        this._initted = 1;
        this._zTime = totalTime;
        prevTime = 0; // upon init, the playhead should always go forward; someone could invalidate() a completed timeline and then if they restart(), that would make child tweens render in reverse order which could lock in the wrong starting values if they build on each other, like tl.to(obj, {x: 100}).to(obj, {x: 0}).
      }
      if (!prevTime && time && !suppressEvents) {
        _callback(this, 'onStart');
        if (this._tTime !== tTime) {
          // in case the onStart triggered a render at a different spot, eject. Like if someone did animation.pause(0.5) or something inside the onStart.
          return this;
        }
      }
      if (time >= prevTime && totalTime >= 0) {
        child = this._first;
        while (child) {
          next = child._next;
          if (
            (child._act || time >= child._start) &&
            child._ts &&
            pauseTween !== child
          ) {
            if (child.parent !== this) {
              // an extreme edge case - the child's render could do something like kill() the "next" one in the linked list, or reparent it. In that case we must re-initiate the whole render to be safe.
              return this.render(totalTime, suppressEvents, force);
            }
            child.render(
              child._ts > 0
                ? (time - child._start) * child._ts
                : (child._dirty ? child.totalDuration() : child._tDur) +
                    (time - child._start) * child._ts,
              suppressEvents,
              force
            );
            if (time !== this._time || (!this._ts && !prevPaused)) {
              //in case a tween pauses or seeks the timeline when rendering, like inside of an onUpdate/onComplete
              pauseTween = 0;
              next && (tTime += this._zTime = -_tinyNum); // it didn't finish rendering, so flag zTime as negative so that so that the next time render() is called it'll be forced (to render any remaining children)
              break;
            }
          }
          child = next;
        }
      } else {
        child = this._last;
        let adjustedTime = totalTime < 0 ? totalTime : time; //when the playhead goes backward beyond the start of this timeline, we must pass that information down to the child animations so that zero-duration tweens know whether to render their starting or ending values.
        while (child) {
          next = child._prev;
          if (
            (child._act || adjustedTime <= child._end) &&
            child._ts &&
            pauseTween !== child
          ) {
            if (child.parent !== this) {
              // an extreme edge case - the child's render could do something like kill() the "next" one in the linked list, or reparent it. In that case we must re-initiate the whole render to be safe.
              return this.render(totalTime, suppressEvents, force);
            }
            child.render(
              child._ts > 0
                ? (adjustedTime - child._start) * child._ts
                : (child._dirty ? child.totalDuration() : child._tDur) +
                    (adjustedTime - child._start) * child._ts,
              suppressEvents,
              force
            );
            if (time !== this._time || (!this._ts && !prevPaused)) {
              //in case a tween pauses or seeks the timeline when rendering, like inside of an onUpdate/onComplete
              pauseTween = 0;
              next &&
                (tTime += this._zTime = adjustedTime ? -_tinyNum : _tinyNum); // it didn't finish rendering, so adjust zTime so that so that the next time render() is called it'll be forced (to render any remaining children)
              break;
            }
          }
          child = next;
        }
      }
      if (pauseTween && !suppressEvents) {
        this.pause();
        pauseTween.render(time >= prevTime ? 0 : -_tinyNum)._zTime =
          time >= prevTime ? 1 : -1;
        if (this._ts) {
          //the callback resumed playback! So since we may have held back the playhead due to where the pause is positioned, go ahead and jump to where it's SUPPOSED to be (if no pause happened).
          this._start = prevStart; //if the pause was at an earlier time and the user resumed in the callback, it could reposition the timeline (changing its startTime), throwing things off slightly, so we make sure the _start doesn't shift.
          _setEnd(this);
          return this.render(totalTime, suppressEvents, force);
        }
      }
      this._onUpdate && !suppressEvents && _callback(this, 'onUpdate', true);
      if (
        (tTime === tDur && this._tTime >= this.totalDuration()) ||
        (!tTime && prevTime)
      )
        if (
          prevStart === this._start ||
          Math.abs(timeScale) !== Math.abs(this._ts)
        )
          if (!this._lock) {
            // remember, a child's callback may alter this timeline's playhead or timeScale which is why we need to add some of these checks.
            (totalTime || !dur) &&
              ((tTime === tDur && this._ts > 0) || (!tTime && this._ts < 0)) &&
              _removeFromParent(this, 1); // don't remove if the timeline is reversed and the playhead isn't at 0, otherwise tl.progress(1).reverse() won't work. Only remove if the playhead is at the end and timeScale is positive, or if the playhead is at 0 and the timeScale is negative.
            if (
              !suppressEvents &&
              !(totalTime < 0 && !prevTime) &&
              (tTime || prevTime || !tDur)
            ) {
              _callback(
                this,
                tTime === tDur && totalTime >= 0
                  ? 'onComplete'
                  : 'onReverseComplete',
                true
              );
              this._prom &&
                !(tTime < tDur && this.timeScale() > 0) &&
                this._prom();
            }
          }
    }
    return this;
  }

  add(child, position) {
    _isNumber(position) || (position = _parsePosition(this, position, child));
    if (!(child instanceof Animation)) {
      if (_isArray(child)) {
        child.forEach((obj) => this.add(obj, position));
        return this;
      }
      if (_isString(child)) {
        return this.addLabel(child, position);
      }
      if (_isFunction(child)) {
        child = Tween.delayedCall(0, child);
      } else {
        return this;
      }
    }
    return this !== child ? _addToTimeline(this, child, position) : this; //don't allow a timeline to be added to itself as a child!
  }

  getChildren(
    nested = true,
    tweens = true,
    timelines = true,
    ignoreBeforeTime = -_bigNum
  ) {
    let a = [],
      child = this._first;
    while (child) {
      if (child._start >= ignoreBeforeTime) {
        if (child instanceof Tween) {
          tweens && a.push(child);
        } else {
          timelines && a.push(child);
          nested && a.push(...child.getChildren(true, tweens, timelines));
        }
      }
      child = child._next;
    }
    return a;
  }

  getById(id) {
    let animations = this.getChildren(1, 1, 1),
      i = animations.length;
    while (i--) {
      if (animations[i].vars.id === id) {
        return animations[i];
      }
    }
  }

  remove(child) {
    if (_isString(child)) {
      return this.removeLabel(child);
    }
    if (_isFunction(child)) {
      return this.killTweensOf(child);
    }
    _removeLinkedListItem(this, child);
    if (child === this._recent) {
      this._recent = this._last;
    }
    return _uncache(this);
  }

  totalTime(totalTime, suppressEvents) {
    if (!arguments.length) {
      return this._tTime;
    }
    this._forcing = 1;
    if (!this._dp && this._ts) {
      //special case for the global timeline (or any other that has no parent or detached parent).
      this._start = _roundPrecise(
        _ticker.time -
          (this._ts > 0
            ? totalTime / this._ts
            : (this.totalDuration() - totalTime) / -this._ts)
      );
    }
    super.totalTime(totalTime, suppressEvents);
    this._forcing = 0;
    return this;
  }

  addLabel(label, position) {
    this.labels[label] = _parsePosition(this, position);
    return this;
  }

  removeLabel(label) {
    delete this.labels[label];
    return this;
  }

  addPause(position, callback, params) {
    let t = Tween.delayedCall(0, callback || _emptyFunc, params);
    t.data = 'isPause';
    this._hasPause = 1;
    return _addToTimeline(this, t, _parsePosition(this, position));
  }

  removePause(position) {
    let child = this._first;
    position = _parsePosition(this, position);
    while (child) {
      if (child._start === position && child.data === 'isPause') {
        _removeFromParent(child);
      }
      child = child._next;
    }
  }

  killTweensOf(targets: any, props?: any, onlyActive?: any) {
    let tweens = this.getTweensOf(targets, onlyActive),
      i = tweens.length;
    while (i--) {
      _overwritingTween !== tweens[i] && tweens[i].kill(targets, props);
    }
    return this;
  }

  getTweensOf(targets, onlyActive) {
    let a = [],
      parsedTargets = toArray(targets),
      child = this._first,
      isGlobalTime = _isNumber(onlyActive), // a number is interpreted as a global time. If the animation spans
      children;
    while (child) {
      if (child instanceof Tween) {
        if (
          _arrayContainsAny(child._targets, parsedTargets) &&
          (isGlobalTime
            ? (!_overwritingTween || (child._initted && child._ts)) &&
              child.globalTime(0) <= onlyActive &&
              child.globalTime(child.totalDuration()) > onlyActive
            : !onlyActive || child.isActive())
        ) {
          // note: if this is for overwriting, it should only be for tweens that aren't paused and are initted.
          a.push(child);
        }
      } else if (
        (children = child.getTweensOf(parsedTargets, onlyActive)).length
      ) {
        a.push(...children);
      }
      child = child._next;
    }
    return a;
  }

  // potential future feature - targets() on timelines
  // targets() {
  // 	let result = [];
  // 	this.getChildren(true, true, false).forEach(t => result.push(...t.targets()));
  // 	return result.filter((v, i) => result.indexOf(v) === i);
  // }

  tweenTo(position, vars) {
    vars = vars || {};
    let tl = this,
      endTime = _parsePosition(tl, position),
      { startAt, onStart, onStartParams, immediateRender } = vars,
      initted,
      tween = Tween.to(
        tl,
        _setDefaults(
          {
            ease: vars.ease || 'none',
            lazy: false,
            immediateRender: false,
            time: endTime,
            overwrite: 'auto',
            duration:
              vars.duration ||
              Math.abs(
                (endTime -
                  (startAt && 'time' in startAt ? startAt.time : tl._time)) /
                  tl.timeScale()
              ) ||
              _tinyNum,
            onStart: () => {
              tl.pause();
              if (!initted) {
                let duration =
                  vars.duration ||
                  Math.abs(
                    (endTime -
                      (startAt && 'time' in startAt
                        ? startAt.time
                        : tl._time)) /
                      tl.timeScale()
                  );
                tween._dur !== duration &&
                  _setDuration(tween, duration, 0, 1).render(
                    tween._time,
                    true,
                    true
                  );
                initted = 1;
              }
              onStart && onStart.apply(tween, onStartParams || []); //in case the user had an onStart in the vars - we don't want to overwrite it.
            },
          },
          vars
        )
      );
    return immediateRender ? tween.render(0) : tween;
  }

  tweenFromTo(fromPosition, toPosition, vars) {
    return this.tweenTo(
      toPosition,
      _setDefaults(
        { startAt: { time: _parsePosition(this, fromPosition) } },
        vars
      )
    );
  }

  recent() {
    return this._recent;
  }

  nextLabel(afterTime = this._time) {
    return _getLabelInDirection(this, _parsePosition(this, afterTime));
  }

  previousLabel(beforeTime = this._time) {
    return _getLabelInDirection(this, _parsePosition(this, beforeTime), 1);
  }

  currentLabel(value) {
    return arguments.length
      ? this.seek(value, true)
      : this.previousLabel(this._time + _tinyNum);
  }

  shiftChildren(amount, adjustLabels, ignoreBeforeTime = 0) {
    let child = this._first,
      labels = this.labels,
      p;
    while (child) {
      if (child._start >= ignoreBeforeTime) {
        child._start += amount;
        child._end += amount;
      }
      child = child._next;
    }
    if (adjustLabels) {
      for (p in labels) {
        if (labels[p] >= ignoreBeforeTime) {
          labels[p] += amount;
        }
      }
    }
    return _uncache(this);
  }

  invalidate() {
    let child = this._first;
    this._lock = 0;
    while (child) {
      child.invalidate();
      child = child._next;
    }
    return super.invalidate();
  }

  clear(includeLabels = true) {
    let child = this._first,
      next;
    while (child) {
      next = child._next;
      this.remove(child);
      child = next;
    }
    this._dp && (this._time = this._tTime = this._pTime = 0);
    includeLabels && (this.labels = {});
    return _uncache(this);
  }

  totalDuration(value) {
    let max = 0,
      self = this,
      child = self._last,
      prevStart = _bigNum,
      prev,
      start,
      parent;
    if (arguments.length) {
      return self.timeScale(
        (self._repeat < 0 ? self.duration() : self.totalDuration()) /
          (self.reversed() ? -value : value)
      );
    }
    if (self._dirty) {
      parent = self.parent;
      while (child) {
        prev = child._prev; //record it here in case the tween changes position in the sequence...
        child._dirty && child.totalDuration(); //could change the tween._startTime, so make sure the animation's cache is clean before analyzing it.
        start = child._start;
        if (start > prevStart && self._sort && child._ts && !self._lock) {
          //in case one of the tweens shifted out of order, it needs to be re-inserted into the correct position in the sequence
          self._lock = 1; //prevent endless recursive calls - there are methods that get triggered that check duration/totalDuration when we add().
          _addToTimeline(self, child, start - child._delay, 1)._lock = 0;
        } else {
          prevStart = start;
        }
        if (start < 0 && child._ts) {
          //children aren't allowed to have negative startTimes unless smoothChildTiming is true, so adjust here if one is found.
          max -= start;
          if ((!parent && !self._dp) || (parent && parent.smoothChildTiming)) {
            self._start += start / self._ts;
            self._time -= start;
            self._tTime -= start;
          }
          self.shiftChildren(-start, false, -1e999);
          prevStart = 0;
        }
        child._end > max && child._ts && (max = child._end);
        child = prev;
      }
      _setDuration(
        self,
        self === _globalTimeline && self._time > max ? self._time : max,
        1,
        1
      );
      self._dirty = 0;
    }
    return self._tDur;
  }

  static updateRoot(time) {
    if (_globalTimeline._ts) {
      _lazySafeRender(
        _globalTimeline,
        _parentToChildTotalTime(time, _globalTimeline)
      );
      _lastRenderedFrame = _ticker.frame;
    }
    if (_ticker.frame >= _nextGCFrame) {
      _nextGCFrame += _config.autoSleep || 120;
      let child = _globalTimeline._first;
      if (!child || !child._ts)
        if (_config.autoSleep && _ticker._listeners.length < 2) {
          while (child && !child._ts) {
            child = child._next;
          }
          child || _ticker.sleep();
        }
    }
  }
}

setDefaults(Timeline.prototype, { _lock: 0, _hasPause: 0, _forcing: 0 });

let _addComplexStringPropTween = function (
  target,
  prop,
  start,
  end,
  setter,
  stringFilter,
  funcParam
) {
  //note: we call _addComplexStringPropTween.call(tweenInstance...) to ensure that it's scoped properly. We may call it from within a plugin too, thus "this" would refer to the plugin.
  let pt = new PropTween(
      this._pt,
      target,
      prop,
      0,
      1,
      _renderComplexString,
      null,
      setter
    ),
    index = 0,
    matchIndex = 0,
    result,
    startNums,
    color,
    endNum,
    chunk,
    startNum,
    hasRandom,
    a;
  pt.b = start;
  pt.e = end;
  start += ''; //ensure values are strings
  end += '';
  if ((hasRandom = ~end.indexOf('random('))) {
    end = _replaceRandom(end);
  }
  if (stringFilter) {
    a = [start, end];
    stringFilter(a, target, prop); //pass an array with the starting and ending values and let the filter do whatever it needs to the values.
    start = a[0];
    end = a[1];
  }
  startNums = start.match(_complexStringNumExp) || [];
  while ((result = _complexStringNumExp.exec(end))) {
    endNum = result[0];
    chunk = end.substring(index, result.index);
    if (color) {
      color = (color + 1) % 5;
    } else if (chunk.substr(-5) === 'rgba(') {
      color = 1;
    }
    if (endNum !== startNums[matchIndex++]) {
      startNum = parseFloat(startNums[matchIndex - 1]) || 0;
      //these nested PropTweens are handled in a special way - we'll never actually call a render or setter method on them. We'll just loop through them in the parent complex string PropTween's render method.
      pt._pt = {
        _next: pt._pt,
        p: chunk || matchIndex === 1 ? chunk : ',', //note: SVG spec allows omission of comma/space when a negative sign is wedged between two numbers, like 2.5-5.3 instead of 2.5,-5.3 but when tweening, the negative value may switch to positive, so we insert the comma just in case.
        s: startNum,
        c:
          endNum.charAt(1) === '='
            ? _parseRelative(startNum, endNum) - startNum
            : parseFloat(endNum) - startNum,
        m: color && color < 4 ? Math.round : 0,
      };
      index = _complexStringNumExp.lastIndex;
    }
  }
  pt.c = index < end.length ? end.substring(index, end.length) : ''; //we use the "c" of the PropTween to store the final part of the string (after the last number)
  pt.fp = funcParam;
  if (_relExp.test(end) || hasRandom) {
    pt.e = 0; //if the end string contains relative values or dynamic random(...) values, delete the end it so that on the final render we don't actually set it to the string with += or -= characters (forces it to use the calculated value).
  }
  this._pt = pt; //start the linked list with this new PropTween. Remember, we call _addComplexStringPropTween.call(tweenInstance...) to ensure that it's scoped properly. We may call it from within a plugin too, thus "this" would refer to the plugin.
  return pt;
};

export const addPropTween = function (
    this: any,
    target: any,
    prop: any,
    start: any,
    end: any,
    index?: any,
    targets?: any,
    modifier?: any,
    stringFilter?: any,
    funcParam?: any
  ) {
    isFunction(end) && (end = end(index || 0, target, targets));
    let currentValue = target[prop],
      parsedStart =
        start !== 'get'
          ? start
          : !isFunction(currentValue)
          ? currentValue
          : funcParam
          ? target[
              prop.indexOf('set') || !isFunction(target['get' + prop.substr(3)])
                ? prop
                : 'get' + prop.substr(3)
            ](funcParam)
          : target[prop](),
      setter = !isFunction(currentValue)
        ? setterPlain
        : funcParam
        ? setterFuncWithParam
        : setterFunc,
      pt;
    if (isString(end)) {
      if (~end.indexOf('random(')) {
        end = replaceRandom(end);
      }
      if (end.charAt(1) === '=') {
        pt = parseRelative(parsedStart, end) + (getUnit(parsedStart) || 0);
        if (pt || pt === 0) {
          // to avoid isNaN, like if someone passes in a value like "!= whatever"
          end = pt;
        }
      }
    }
    if (parsedStart !== end || _forceAllPropTweens) {
      if (!isNaN(parsedStart * end) && end !== '') {
        // fun fact: any number multiplied by "" is evaluated as the number 0!
        pt = new PropTween(
          this._pt,
          target,
          prop,
          +parsedStart || 0,
          end - (parsedStart || 0),
          typeof currentValue === 'boolean' ? renderBoolean : renderPlain,
          0,
          setter
        );
        funcParam && (pt.fp = funcParam);
        modifier && pt.modifier(modifier, this, target);
        return (this._pt = pt);
      }
      !currentValue && !(prop in target) && missingPlugin(prop, end);
      return _addComplexStringPropTween.call(
        this,
        target,
        prop,
        parsedStart,
        end,
        setter,
        stringFilter || config.stringFilter,
        funcParam
      );
    }
  },
  //creates a copy of the vars object and processes any function-based values (putting the resulting values directly into the copy) as well as strings with "random()" in them. It does NOT process relative values.
  _processVars = (vars, index, target, targets, tween) => {
    _isFunction(vars) &&
      (vars = _parseFuncOrString(vars, tween, index, target, targets));
    if (
      !_isObject(vars) ||
      (vars.style && vars.nodeType) ||
      _isArray(vars) ||
      _isTypedArray(vars)
    ) {
      return _isString(vars)
        ? _parseFuncOrString(vars, tween, index, target, targets)
        : vars;
    }
    let copy = {},
      p;
    for (p in vars) {
      copy[p] = _parseFuncOrString(vars[p], tween, index, target, targets);
    }
    return copy;
  },
  _checkPlugin = (property, vars, tween, index, target, targets) => {
    let plugin, pt, ptLookup, i;
    if (
      _plugins[property] &&
      (plugin = new _plugins[property]()).init(
        target,
        plugin.rawVars
          ? vars[property]
          : _processVars(vars[property], index, target, targets, tween),
        tween,
        index,
        targets
      ) !== false
    ) {
      tween._pt = pt = new PropTween(
        tween._pt,
        target,
        property,
        0,
        1,
        plugin.render,
        plugin,
        0,
        plugin.priority
      );
      if (tween !== _quickTween) {
        ptLookup = tween._ptLookup[tween._targets.indexOf(target)]; //note: we can't use tween._ptLookup[index] because for staggered tweens, the index from the fullTargets array won't match what it is in each individual tween that spawns from the stagger.
        i = plugin._props.length;
        while (i--) {
          ptLookup[plugin._props[i]] = pt;
        }
      }
    }
    return plugin;
  };

let _overwritingTween: any; //store a reference temporarily so we can avoid overwriting itself.
let _forceAllPropTweens: any;
export const initTween = (tween, time) => {
    let vars = tween.vars,
      {
        ease,
        startAt,
        immediateRender,
        lazy,
        onUpdate,
        onUpdateParams,
        callbackScope,
        runBackwards,
        yoyoEase,
        keyframes,
        autoRevert,
      } = vars,
      dur = tween._dur,
      prevStartAt = tween._startAt,
      targets = tween._targets,
      parent = tween.parent,
      //when a stagger (or function-based duration/delay) is on a Tween instance, we create a nested timeline which means that the "targets" of that tween don't reflect the parent. This function allows us to discern when it's a nested tween and in that case, return the full targets array so that function-based values get calculated properly.
      fullTargets =
        parent && parent.data === 'nested' ? parent.parent._targets : targets,
      autoOverwrite = tween._overwrite === 'auto' && !_suppressOverwrites,
      tl = tween.timeline,
      cleanVars,
      i,
      p,
      pt,
      target,
      hasPriority,
      gsData,
      harness,
      plugin,
      ptLookup,
      index,
      harnessVars,
      overwritten;
    tl && (!keyframes || !ease) && (ease = 'none');
    tween._ease = parseEase(ease, defaults.ease);
    tween._yEase = yoyoEase
      ? invertEase(
          parseEase(yoyoEase === true ? ease : yoyoEase, defaults.ease)
        )
      : 0;
    if (yoyoEase && tween._yoyo && !tween._repeat) {
      //there must have been a parent timeline with yoyo:true that is currently in its yoyo phase, so flip the eases.
      yoyoEase = tween._yEase;
      tween._yEase = tween._ease;
      tween._ease = yoyoEase;
    }
    tween._from = !tl && !!vars.runBackwards; //nested timelines should never run backwards - the backwards-ness is in the child tweens.
    if (!tl || (keyframes && !vars.stagger)) {
      //if there's an internal timeline, skip all the parsing because we passed that task down the chain.
      harness = targets[0] ? getCache(targets[0]).harness : 0;
      harnessVars = harness && vars[harness.prop]; //someone may need to specify CSS-specific values AND non-CSS values, like if the element has an "x" property plus it's a standard DOM element. We allow people to distinguish by wrapping plugin-specific stuff in a css:{} object for example.
      cleanVars = copyExcluding(vars, reservedProps);
      if (prevStartAt) {
        removeFromParent(prevStartAt.render(-1, true));
        prevStartAt._lazy = 0;
      }
      if (startAt) {
        removeFromParent(
          (tween._startAt = Tween.set(
            targets,
            setDefaults(
              {
                data: 'isStart',
                overwrite: false,
                parent: parent,
                immediateRender: true,
                lazy: isNotFalse(lazy),
                startAt: null,
                delay: 0,
                onUpdate: onUpdate,
                onUpdateParams: onUpdateParams,
                callbackScope: callbackScope,
                stagger: 0,
              },
              startAt
            )
          ))
        ); //copy the properties/values into a new object to avoid collisions, like var to = {x:0}, from = {x:500}; timeline.fromTo(e, from, to).fromTo(e, to, from);
        time < 0 &&
          !immediateRender &&
          !autoRevert &&
          tween._startAt.render(-1, true); // rare edge case, like if a render is forced in the negative direction of a non-initted tween.
        if (immediateRender) {
          time > 0 && !autoRevert && (tween._startAt = 0); //tweens that render immediately (like most from() and fromTo() tweens) shouldn't revert when their parent timeline's playhead goes backward past the startTime because the initial render could have happened anytime and it shouldn't be directly correlated to this tween's startTime. Imagine setting up a complex animation where the beginning states of various objects are rendered immediately but the tween doesn't happen for quite some time - if we revert to the starting values as soon as the playhead goes backward past the tween's startTime, it will throw things off visually. Reversion should only happen in Timeline instances where immediateRender was false or when autoRevert is explicitly set to true.
          if (dur && time <= 0) {
            time && (tween._zTime = time);
            return; //we skip initialization here so that overwriting doesn't occur until the tween actually begins. Otherwise, if you create several immediateRender:true tweens of the same target/properties to drop into a Timeline, the last one created would overwrite the first ones because they didn't get placed into the timeline yet before the first render occurs and kicks in overwriting.
          }
          // if (time > 0) {
          // 	autoRevert || (tween._startAt = 0); //tweens that render immediately (like most from() and fromTo() tweens) shouldn't revert when their parent timeline's playhead goes backward past the startTime because the initial render could have happened anytime and it shouldn't be directly correlated to this tween's startTime. Imagine setting up a complex animation where the beginning states of various objects are rendered immediately but the tween doesn't happen for quite some time - if we revert to the starting values as soon as the playhead goes backward past the tween's startTime, it will throw things off visually. Reversion should only happen in Timeline instances where immediateRender was false or when autoRevert is explicitly set to true.
          // } else if (dur && !(time < 0 && prevStartAt)) {
          // 	time && (tween._zTime = time);
          // 	return; //we skip initialization here so that overwriting doesn't occur until the tween actually begins. Otherwise, if you create several immediateRender:true tweens of the same target/properties to drop into a Timeline, the last one created would overwrite the first ones because they didn't get placed into the timeline yet before the first render occurs and kicks in overwriting.
          // }
        } else if (autoRevert === false) {
          tween._startAt = 0;
        }
      } else if (runBackwards && dur) {
        //from() tweens must be handled uniquely: their beginning values must be rendered but we don't want overwriting to occur yet (when time is still 0). Wait until the tween actually begins before doing all the routines like overwriting. At that time, we should render at the END of the tween to ensure that things initialize correctly (remember, from() tweens go backwards)
        if (prevStartAt) {
          !autoRevert && (tween._startAt = 0);
        } else {
          time && (immediateRender = false); //in rare cases (like if a from() tween runs and then is invalidate()-ed), immediateRender could be true but the initial forced-render gets skipped, so there's no need to force the render in this context when the _time is greater than 0
          p = setDefaults(
            {
              overwrite: false,
              data: 'isFromStart', //we tag the tween with as "isFromStart" so that if [inside a plugin] we need to only do something at the very END of a tween, we have a way of identifying this tween as merely the one that's setting the beginning values for a "from()" tween. For example, clearProps in CSSPlugin should only get applied at the very END of a tween and without this tag, from(...{height:100, clearProps:"height", delay:1}) would wipe the height at the beginning of the tween and after 1 second, it'd kick back in.
              lazy: immediateRender && _isNotFalse(lazy),
              immediateRender: immediateRender, //zero-duration tweens render immediately by default, but if we're not specifically instructed to render this tween immediately, we should skip this and merely _init() to record the starting values (rendering them immediately would push them to completion which is wasteful in that case - we'd have to render(-1) immediately after)
              stagger: 0,
              parent: parent, //ensures that nested tweens that had a stagger are handled properly, like gsap.from(".class", {y:gsap.utils.wrap([-100,100])})
            },
            cleanVars
          );
          harnessVars && (p[harness.prop] = harnessVars); // in case someone does something like .from(..., {css:{}})
          removeFromParent((tween._startAt = Tween.set(targets, p)));
          time < 0 && tween._startAt.render(-1, true); // rare edge case, like if a render is forced in the negative direction of a non-initted from() tween.
          tween._zTime = time;
          if (!immediateRender) {
            initTween(tween._startAt, tinyNum); //ensures that the initial values are recorded
          } else if (!time) {
            return;
          }
        }
      }
      tween._pt = tween._ptCache = 0;
      lazy = (dur && isNotFalse(lazy)) || (lazy && !dur);
      for (i = 0; i < targets.length; i++) {
        target = targets[i];
        gsData = target._gsap || harness(targets)[i]._gsap;
        tween._ptLookup[i] = ptLookup = {};
        _lazyLookup[gsData.id] && _lazyTweens.length && lazyRender(); //if other tweens of the same target have recently initted but haven't rendered yet, we've got to force the render so that the starting values are correct (imagine populating a timeline with a bunch of sequential tweens and then jumping to the end)
        index = fullTargets === targets ? i : fullTargets.indexOf(target);
        if (
          harness &&
          (plugin = new harness()).init(
            target,
            harnessVars || cleanVars,
            tween,
            index,
            fullTargets
          ) !== false
        ) {
          tween._pt = pt = new PropTween(
            tween._pt,
            target,
            plugin.name,
            0,
            1,
            plugin.render,
            plugin,
            0,
            plugin.priority
          );
          plugin._props.forEach((name) => {
            ptLookup[name] = pt;
          });
          plugin.priority && (hasPriority = 1);
        }
        if (!harness || harnessVars) {
          for (p in cleanVars) {
            if (
              _plugins[p] &&
              (plugin = _checkPlugin(
                p,
                cleanVars,
                tween,
                index,
                target,
                fullTargets
              ))
            ) {
              plugin.priority && (hasPriority = 1);
            } else {
              ptLookup[p] = pt = _addPropTween.call(
                tween,
                target,
                p,
                'get',
                cleanVars[p],
                index,
                fullTargets,
                0,
                vars.stringFilter
              );
            }
          }
        }
        tween._op && tween._op[i] && tween.kill(target, tween._op[i]);
        if (autoOverwrite && tween._pt) {
          _overwritingTween = tween;
          _globalTimeline.killTweensOf(
            target,
            ptLookup,
            tween.globalTime(time)
          ); // make sure the overwriting doesn't overwrite THIS tween!!!
          overwritten = !tween.parent;
          _overwritingTween = 0;
        }
        tween._pt && lazy && (_lazyLookup[gsData.id] = 1);
      }
      hasPriority && _sortPropTweensByPriority(tween);
      tween._onInit && tween._onInit(tween); //plugins like RoundProps must wait until ALL of the PropTweens are instantiated. In the plugin's init() function, it sets the _onInit on the tween instance. May not be pretty/intuitive, but it's fast and keeps file size down.
    }
    tween._onUpdate = onUpdate;
    tween._initted = (!tween._op || tween._pt) && !overwritten; // if overwrittenProps resulted in the entire tween being killed, do NOT flag it as initted or else it may render for one tick.
    keyframes && time <= 0 && tl.render(_bigNum, true, true); // if there's a 0% keyframe, it'll render in the "before" state for any staggered/delayed animations thus when the following tween initializes, it'll use the "before" state instead of the "after" state as the initial values.
  },
  _updatePropTweens = (
    tween,
    property,
    value,
    start,
    startIsRelative,
    ratio,
    time
  ) => {
    let ptCache = ((tween._pt && tween._ptCache) || (tween._ptCache = {}))[
        property
      ],
      pt,
      lookup,
      i;
    if (!ptCache) {
      ptCache = tween._ptCache[property] = [];
      lookup = tween._ptLookup;
      i = tween._targets.length;
      while (i--) {
        pt = lookup[i][property];
        if (pt && pt.d && pt.d._pt) {
          // it's a plugin, so find the nested PropTween
          pt = pt.d._pt;
          while (pt && pt.p !== property) {
            pt = pt._next;
          }
        }
        if (!pt) {
          // there is no PropTween associated with that property, so we must FORCE one to be created and ditch out of this
          // if the tween has other properties that already rendered at new positions, we'd normally have to rewind to put them back like tween.render(0, true) before forcing an _initTween(), but that can create another edge case like tweening a timeline's progress would trigger onUpdates to fire which could move other things around. It's better to just inform users that .resetTo() should ONLY be used for tweens that already have that property. For example, you can't gsap.to(...{ y: 0 }) and then tween.restTo("x", 200) for example.
          _forceAllPropTweens = 1; // otherwise, when we _addPropTween() and it finds no change between the start and end values, it skips creating a PropTween (for efficiency...why tween when there's no difference?) but in this case we NEED that PropTween created so we can edit it.
          tween.vars[property] = '+=0';
          _initTween(tween, time);
          _forceAllPropTweens = 0;
          return 1;
        }
        ptCache.push(pt);
      }
    }
    i = ptCache.length;
    while (i--) {
      pt = ptCache[i];
      pt.s =
        (start || start === 0) && !startIsRelative
          ? start
          : pt.s + (start || 0) + ratio * pt.c;
      pt.c = value - pt.s;
      pt.e && (pt.e = _round(value) + getUnit(pt.e)); // mainly for CSSPlugin (end value)
      pt.b && (pt.b = pt.s + getUnit(pt.b)); // (beginning value)
    }
  },
  _addAliasesToVars = (targets, vars) => {
    let harness = targets[0] ? _getCache(targets[0]).harness : 0,
      propertyAliases = harness && harness.aliases,
      copy,
      p,
      i,
      aliases;
    if (!propertyAliases) {
      return vars;
    }
    copy = _merge({}, vars);
    for (p in propertyAliases) {
      if (p in copy) {
        aliases = propertyAliases[p].split(',');
        i = aliases.length;
        while (i--) {
          copy[aliases[i]] = copy[p];
        }
      }
    }
    return copy;
  };

/**
 * parses multiple formats,
 * like {"0%": {x: 100}, {"50%": {x: -20}}
 * and { x: {"0%": 100, "50%": -20} },
 * and an "ease" can be set on any object.
 * We populate an "allProps" object with an Array for each property,
 * like {x: [{}, {}], y:[{}, {}]} with data for each property tween.
 * The objects have a "t" (time), "v", (value), and "e" (ease) property
 * This allows us to piece together a timeline later.
 */
export const parseKeyframe = (
  prop: any,
  obj: any,
  allProps: any,
  easeEach: any
) => {
  let ease = obj.ease || easeEach || 'power1.inOut',
    p,
    a;
  if (isArray(obj)) {
    a = allProps[prop] || (allProps[prop] = []);
    // t = time (out of 100), v = value, e = ease
    obj.forEach((value, i) =>
      a.push({ t: (i / (obj.length - 1)) * 100, v: value, e: ease })
    );
  } else {
    for (p in obj) {
      a = allProps[p] || (allProps[p] = []);
      p === 'ease' || a.push({ t: parseFloat(prop), v: obj[p], e: ease });
    }
  }
};

export const parseFuncOrString = (
  value: any,
  tween: any,
  i: any,
  target: any,
  targets: any
) =>
  isFunction(value)
    ? value.call(tween, i, target, targets)
    : isString(value) && ~value.indexOf('random(')
    ? replaceRandom(value)
    : value;

export const staggerTweenProps =
  callbackNames + 'repeat,repeatDelay,yoyo,repeatRefresh,yoyoEase,autoRevert';

export const staggerPropsToSkip: any = {};

forEachName(
  staggerTweenProps + ',id,stagger,delay,duration,paused,scrollTrigger',
  (name: any) => (staggerPropsToSkip[name] = 1)
);
