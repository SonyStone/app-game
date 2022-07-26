import { install, installScope } from './globals';

/*
 * --------------------------------------------------------------------------------------
 * TICKER
 * --------------------------------------------------------------------------------------
 */
let tickerActive: any;

export const ticker = (function () {
  let _getTime = Date.now,
    _lagThreshold = 500,
    _adjustedLag = 33,
    _startTime = _getTime(),
    _lastUpdate = _startTime,
    _gap = 1000 / 240,
    _nextTime = _gap,
    _listeners = [],
    _id,
    _req,
    _raf,
    _self,
    _delta,
    _i,
    _tick = (v) => {
      let elapsed = _getTime() - _lastUpdate,
        manual = v === true,
        overlap,
        dispatch,
        time,
        frame;
      elapsed > _lagThreshold && (_startTime += elapsed - _adjustedLag);
      _lastUpdate += elapsed;
      time = _lastUpdate - _startTime;
      overlap = time - _nextTime;
      if (overlap > 0 || manual) {
        frame = ++_self.frame;
        _delta = time - _self.time * 1000;
        _self.time = time = time / 1000;
        _nextTime += overlap + (overlap >= _gap ? 4 : _gap - overlap);
        dispatch = 1;
      }
      manual || (_id = _req(_tick)); //make sure the request is made before we dispatch the "tick" event so that timing is maintained. Otherwise, if processing the "tick" requires a bunch of time (like 15ms) and we're using a setTimeout() that's based on 16.7ms, it'd technically take 31.7ms between frames otherwise.
      if (dispatch) {
        for (_i = 0; _i < _listeners.length; _i++) {
          // use _i and check _listeners.length instead of a variable because a listener could get removed during the loop, and if that happens to an element less than the current index, it'd throw things off in the loop.
          _listeners[_i](time, _delta, frame, v);
        }
      }
    };
  _self = {
    time: 0,
    frame: 0,
    tick() {
      _tick(true);
    },
    deltaRatio(fps) {
      return _delta / (1000 / (fps || 60));
    },
    wake() {
      if (_coreReady) {
        if (!_coreInitted && _windowExists()) {
          _win = _coreInitted = window;
          _doc = _win.document || {};
          _globals.gsap = gsap;
          (_win.gsapVersions || (_win.gsapVersions = [])).push(gsap.version);
          install(
            installScope || _win.GreenSockGlobals || (!_win.gsap && _win) || {}
          );
          _raf = _win.requestAnimationFrame;
        }
        _id && _self.sleep();
        _req =
          _raf ||
          ((f) => setTimeout(f, (_nextTime - _self.time * 1000 + 1) | 0));
        _tickerActive = 1;
        _tick(2);
      }
    },
    sleep() {
      (_raf ? _win.cancelAnimationFrame : clearTimeout)(_id);
      _tickerActive = 0;
      _req = _emptyFunc;
    },
    lagSmoothing(threshold, adjustedLag) {
      _lagThreshold = threshold || 1 / _tinyNum; //zero should be interpreted as basically unlimited
      _adjustedLag = Math.min(adjustedLag, _lagThreshold, 0);
    },
    fps(fps) {
      _gap = 1000 / (fps || 240);
      _nextTime = _self.time * 1000 + _gap;
    },
    add(callback, once, prioritize) {
      let func = once
        ? (t, d, f, v) => {
            callback(t, d, f, v);
            _self.remove(func);
          }
        : callback;
      _self.remove(callback);
      _listeners[prioritize ? 'unshift' : 'push'](func);
      _wake();
      return func;
    },
    remove(callback, i) {
      ~(i = _listeners.indexOf(callback)) &&
        _listeners.splice(i, 1) &&
        _i >= i &&
        _i--;
    },
    _listeners: _listeners,
  };
  return _self;
})();

export const wake = () => !tickerActive && ticker.wake(); //also ensures the core classes are initialized.
