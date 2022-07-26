/*
 * --------------------------------------------------------------------------------------
 * ANIMATION
 * --------------------------------------------------------------------------------------
 */

export class Animation {
  constructor(vars) {
    this.vars = vars;
    this._delay = +vars.delay || 0;
    if ((this._repeat = vars.repeat === Infinity ? -2 : vars.repeat || 0)) {
      // TODO: repeat: Infinity on a timeline's children must flag that timeline internally and affect its totalDuration, otherwise it'll stop in the negative direction when reaching the start.
      this._rDelay = vars.repeatDelay || 0;
      this._yoyo = !!vars.yoyo || !!vars.yoyoEase;
    }
    this._ts = 1;
    _setDuration(this, +vars.duration, 1, 1);
    this.data = vars.data;
    _tickerActive || _ticker.wake();
  }

  delay(value) {
    if (value || value === 0) {
      this.parent &&
        this.parent.smoothChildTiming &&
        this.startTime(this._start + value - this._delay);
      this._delay = value;
      return this;
    }
    return this._delay;
  }

  duration(value) {
    return arguments.length
      ? this.totalDuration(
          this._repeat > 0
            ? value + (value + this._rDelay) * this._repeat
            : value
        )
      : this.totalDuration() && this._dur;
  }

  totalDuration(value) {
    if (!arguments.length) {
      return this._tDur;
    }
    this._dirty = 0;
    return _setDuration(
      this,
      this._repeat < 0
        ? value
        : (value - this._repeat * this._rDelay) / (this._repeat + 1)
    );
  }

  totalTime(totalTime, suppressEvents) {
    _wake();
    if (!arguments.length) {
      return this._tTime;
    }
    let parent = this._dp;
    if (parent && parent.smoothChildTiming && this._ts) {
      _alignPlayhead(this, totalTime);
      !parent._dp || parent.parent || _postAddChecks(parent, this); // edge case: if this is a child of a timeline that already completed, for example, we must re-activate the parent.
      //in case any of the ancestor timelines had completed but should now be enabled, we should reset their totalTime() which will also ensure that they're lined up properly and enabled. Skip for animations that are on the root (wasteful). Example: a TimelineLite.exportRoot() is performed when there's a paused tween on the root, the export will not complete until that tween is unpaused, but imagine a child gets restarted later, after all [unpaused] tweens have completed. The start of that child would get pushed out, but one of the ancestors may have completed.
      while (parent && parent.parent) {
        if (
          parent.parent._time !==
          parent._start +
            (parent._ts >= 0
              ? parent._tTime / parent._ts
              : (parent.totalDuration() - parent._tTime) / -parent._ts)
        ) {
          parent.totalTime(parent._tTime, true);
        }
        parent = parent.parent;
      }
      if (
        !this.parent &&
        this._dp.autoRemoveChildren &&
        ((this._ts > 0 && totalTime < this._tDur) ||
          (this._ts < 0 && totalTime > 0) ||
          (!this._tDur && !totalTime))
      ) {
        //if the animation doesn't have a parent, put it back into its last parent (recorded as _dp for exactly cases like this). Limit to parents with autoRemoveChildren (like globalTimeline) so that if the user manually removes an animation from a timeline and then alters its playhead, it doesn't get added back in.
        _addToTimeline(this._dp, this, this._start - this._delay);
      }
    }
    if (
      this._tTime !== totalTime ||
      (!this._dur && !suppressEvents) ||
      (this._initted && Math.abs(this._zTime) === _tinyNum) ||
      (!totalTime && !this._initted && (this.add || this._ptLookup))
    ) {
      // check for _ptLookup on a Tween instance to ensure it has actually finished being instantiated, otherwise if this.reverse() gets called in the Animation  constructor, it could trigger a render() here even though the _targets weren't populated, thus when _init() is called there won't be any PropTweens (it'll act like the tween is non-functional)
      this._ts || (this._pTime = totalTime); // otherwise, if an animation is paused, then the playhead is moved back to zero, then resumed, it'd revert back to the original time at the pause
      //if (!this._lock) { // avoid endless recursion (not sure we need this yet or if it's worth the performance hit)
      //   this._lock = 1;
      _lazySafeRender(this, totalTime, suppressEvents);
      //   this._lock = 0;
      //}
    }
    return this;
  }

  time(value, suppressEvents) {
    return arguments.length
      ? this.totalTime(
          Math.min(this.totalDuration(), value + _elapsedCycleDuration(this)) %
            (this._dur + this._rDelay) || (value ? this._dur : 0),
          suppressEvents
        )
      : this._time; // note: if the modulus results in 0, the playhead could be exactly at the end or the beginning, and we always defer to the END with a non-zero value, otherwise if you set the time() to the very end (duration()), it would render at the START!
  }

  totalProgress(value, suppressEvents) {
    return arguments.length
      ? this.totalTime(this.totalDuration() * value, suppressEvents)
      : this.totalDuration()
      ? Math.min(1, this._tTime / this._tDur)
      : this.ratio;
  }

  progress(value, suppressEvents) {
    return arguments.length
      ? this.totalTime(
          this.duration() *
            (this._yoyo && !(this.iteration() & 1) ? 1 - value : value) +
            _elapsedCycleDuration(this),
          suppressEvents
        )
      : this.duration()
      ? Math.min(1, this._time / this._dur)
      : this.ratio;
  }

  iteration(value, suppressEvents) {
    let cycleDuration = this.duration() + this._rDelay;
    return arguments.length
      ? this.totalTime(this._time + (value - 1) * cycleDuration, suppressEvents)
      : this._repeat
      ? _animationCycle(this._tTime, cycleDuration) + 1
      : 1;
  }

  // potential future addition:
  // isPlayingBackwards() {
  // 	let animation = this,
  // 		orientation = 1; // 1 = forward, -1 = backward
  // 	while (animation) {
  // 		orientation *= animation.reversed() || (animation.repeat() && !(animation.iteration() & 1)) ? -1 : 1;
  // 		animation = animation.parent;
  // 	}
  // 	return orientation < 0;
  // }

  timeScale(value) {
    if (!arguments.length) {
      return this._rts === -_tinyNum ? 0 : this._rts; // recorded timeScale. Special case: if someone calls reverse() on an animation with timeScale of 0, we assign it -_tinyNum to remember it's reversed.
    }
    if (this._rts === value) {
      return this;
    }
    let tTime =
      this.parent && this._ts
        ? _parentToChildTotalTime(this.parent._time, this)
        : this._tTime; // make sure to do the parentToChildTotalTime() BEFORE setting the new _ts because the old one must be used in that calculation.

    // future addition? Up side: fast and minimal file size. Down side: only works on this animation; if a timeline is reversed, for example, its childrens' onReverse wouldn't get called.
    //(+value < 0 && this._rts >= 0) && _callback(this, "onReverse", true);

    // prioritize rendering where the parent's playhead lines up instead of this._tTime because there could be a tween that's animating another tween's timeScale in the same rendering loop (same parent), thus if the timeScale tween renders first, it would alter _start BEFORE _tTime was set on that tick (in the rendering loop), effectively freezing it until the timeScale tween finishes.
    this._rts = +value || 0;
    this._ts = this._ps || value === -_tinyNum ? 0 : this._rts; // _ts is the functional timeScale which would be 0 if the animation is paused.
    this.totalTime(_clamp(-this._delay, this._tDur, tTime), true);
    _setEnd(this); // if parent.smoothChildTiming was false, the end time didn't get updated in the _alignPlayhead() method, so do it here.
    return _recacheAncestors(this);
  }

  paused(value: any) {
    if (!arguments.length) {
      return this._ps;
    }
    if (this._ps !== value) {
      this._ps = value;
      if (value) {
        this._pTime = this._tTime || Math.max(-this._delay, this.rawTime()); // if the pause occurs during the delay phase, make sure that's factored in when resuming.
        this._ts = this._act = 0; // _ts is the functional timeScale, so a paused tween would effectively have a timeScale of 0. We record the "real" timeScale as _rts (recorded time scale)
      } else {
        _wake();
        this._ts = this._rts;
        //only defer to _pTime (pauseTime) if tTime is zero. Remember, someone could pause() an animation, then scrub the playhead and resume(). If the parent doesn't have smoothChildTiming, we render at the rawTime() because the startTime won't get updated.
        this.totalTime(
          this.parent && !this.parent.smoothChildTiming
            ? this.rawTime()
            : this._tTime || this._pTime,
          this.progress() === 1 &&
            Math.abs(this._zTime) !== _tinyNum &&
            (this._tTime -= _tinyNum)
        ); // edge case: animation.progress(1).pause().play() wouldn't render again because the playhead is already at the end, but the call to totalTime() below will add it back to its parent...and not remove it again (since removing only happens upon rendering at a new time). Offsetting the _tTime slightly is done simply to cause the final render in totalTime() that'll pop it off its timeline (if autoRemoveChildren is true, of course). Check to make sure _zTime isn't -_tinyNum to avoid an edge case where the playhead is pushed to the end but INSIDE a tween/callback, the timeline itself is paused thus halting rendering and leaving a few unrendered. When resuming, it wouldn't render those otherwise.
      }
    }
    return this;
  }

  startTime(value) {
    if (arguments.length) {
      this._start = value;
      let parent = this.parent || this._dp;
      parent &&
        (parent._sort || !this.parent) &&
        _addToTimeline(parent, this, value - this._delay);
      return this;
    }
    return this._start;
  }

  endTime(includeRepeats) {
    return (
      this._start +
      (_isNotFalse(includeRepeats) ? this.totalDuration() : this.duration()) /
        Math.abs(this._ts || 1)
    );
  }

  rawTime(wrapRepeats) {
    let parent = this.parent || this._dp; // _dp = detached parent
    return !parent
      ? this._tTime
      : wrapRepeats &&
        (!this._ts || (this._repeat && this._time && this.totalProgress() < 1))
      ? this._tTime % (this._dur + this._rDelay)
      : !this._ts
      ? this._tTime
      : _parentToChildTotalTime(parent.rawTime(wrapRepeats), this);
  }

  globalTime(rawTime) {
    let animation = this,
      time = arguments.length ? rawTime : animation.rawTime();
    while (animation) {
      time = animation._start + time / (animation._ts || 1);
      animation = animation._dp;
    }
    return time;
  }

  repeat(value) {
    if (arguments.length) {
      this._repeat = value === Infinity ? -2 : value;
      return _onUpdateTotalDuration(this);
    }
    return this._repeat === -2 ? Infinity : this._repeat;
  }

  repeatDelay(value) {
    if (arguments.length) {
      let time = this._time;
      this._rDelay = value;
      _onUpdateTotalDuration(this);
      return time ? this.time(time) : this;
    }
    return this._rDelay;
  }

  yoyo(value) {
    if (arguments.length) {
      this._yoyo = value;
      return this;
    }
    return this._yoyo;
  }

  seek(position, suppressEvents) {
    return this.totalTime(
      _parsePosition(this, position),
      _isNotFalse(suppressEvents)
    );
  }

  restart(includeDelay, suppressEvents) {
    return this.play().totalTime(
      includeDelay ? -this._delay : 0,
      _isNotFalse(suppressEvents)
    );
  }

  play(from, suppressEvents) {
    from != null && this.seek(from, suppressEvents);
    return this.reversed(false).paused(false);
  }

  reverse(from, suppressEvents) {
    from != null && this.seek(from || this.totalDuration(), suppressEvents);
    return this.reversed(true).paused(false);
  }

  pause(atTime, suppressEvents) {
    atTime != null && this.seek(atTime, suppressEvents);
    return this.paused(true);
  }

  resume() {
    return this.paused(false);
  }

  reversed(value) {
    if (arguments.length) {
      !!value !== this.reversed() &&
        this.timeScale(-this._rts || (value ? -_tinyNum : 0)); // in case timeScale is zero, reversing would have no effect so we use _tinyNum.
      return this;
    }
    return this._rts < 0;
  }

  invalidate() {
    this._initted = this._act = 0;
    this._zTime = -_tinyNum;
    return this;
  }

  isActive() {
    let parent = this.parent || this._dp,
      start = this._start,
      rawTime;
    return !!(
      !parent ||
      (this._ts &&
        this._initted &&
        parent.isActive() &&
        (rawTime = parent.rawTime(true)) >= start &&
        rawTime < this.endTime(true) - _tinyNum)
    );
  }

  eventCallback(type, callback, params) {
    let vars = this.vars;
    if (arguments.length > 1) {
      if (!callback) {
        delete vars[type];
      } else {
        vars[type] = callback;
        params && (vars[type + 'Params'] = params);
        type === 'onUpdate' && (this._onUpdate = callback);
      }
      return this;
    }
    return vars[type];
  }

  then(onFulfilled) {
    let self = this;
    return new Promise((resolve) => {
      let f = _isFunction(onFulfilled) ? onFulfilled : _passThrough,
        _resolve = () => {
          let _then = self.then;
          self.then = null; // temporarily null the then() method to avoid an infinite loop (see https://github.com/greensock/GSAP/issues/322)
          _isFunction(f) &&
            (f = f(self)) &&
            (f.then || f === self) &&
            (self.then = _then);
          resolve(f);
          self.then = _then;
        };
      if (
        (self._initted && self.totalProgress() === 1 && self._ts >= 0) ||
        (!self._tTime && self._ts < 0)
      ) {
        _resolve();
      } else {
        self._prom = _resolve;
      }
    });
  }

  kill() {
    _interrupt(this);
  }
}

_setDefaults(Animation.prototype, {
  _time: 0,
  _start: 0,
  _end: 0,
  _tTime: 0,
  _tDur: 0,
  _dirty: 0,
  _repeat: 0,
  _yoyo: false,
  parent: null,
  _initted: false,
  _rDelay: 0,
  _ts: 1,
  _dp: 0,
  ratio: 0,
  _zTime: -_tinyNum,
  _prom: 0,
  _ps: false,
  _rts: 1,
});
