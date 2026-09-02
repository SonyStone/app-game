import { Observable } from '../../shared/utils/observable';
import { Time } from '../../shared/utils/time';

// tslint:disable:ban-types
// tslint:disable:only-arrow-functions

export class TimeSpy {
  private static readonly requestAnimationFrameFunctions = [
    'requestAnimationFrame',
    'msRequestAnimationFrame',
    'webkitRequestAnimationFrame',
    'mozRequestAnimationFrame',
    'oRequestAnimationFrame'
  ];

  private static readonly setTimerFunctions = ['setTimeout', 'setInterval'];

  private static readonly setTimerCommonValues = [0, 15, 16, 33, 32, 40];

  private static readonly fpsWindowSize = 60;

  readonly onFrameStart: Observable<TimeSpy>;
  readonly onFrameEnd: Observable<TimeSpy>;
  readonly onError: Observable<string>;

  private readonly spiedWindow: { [name: string]: any };
  private readonly lastSixtyFramesDuration: number[];
  private readonly restoreFunctions: Array<() => void> = [];

  private lastSixtyFramesCurrentIndex: number;
  private lastSixtyFramesPreviousStart: number;
  private lastFrame: number;
  private speedRatio: number;
  private willPlayNextFrame: boolean;

  constructor(spiedWindow?: { [name: string]: Function }) {
    this.spiedWindow = spiedWindow || window;
    this.lastFrame = 0;

    this.speedRatio = 1;
    this.willPlayNextFrame = false;
    this.onFrameStart = new Observable<TimeSpy>();
    this.onFrameEnd = new Observable<TimeSpy>();
    this.onError = new Observable<string>();

    this.lastSixtyFramesDuration = [];
    this.lastSixtyFramesCurrentIndex = 0;
    this.lastSixtyFramesPreviousStart = 0;
    for (let i = 0; i < TimeSpy.fpsWindowSize; i++) {
      this.lastSixtyFramesDuration[i] = 0;
    }

    this.init();
  }

  playNextFrame(): void {
    this.willPlayNextFrame = true;
  }

  changeSpeedRatio(ratio: number): void {
    this.speedRatio = ratio;
  }

  getFps(): number {
    let accumulator = 0;
    for (let i = 0; i < TimeSpy.fpsWindowSize; i++) {
      accumulator += this.lastSixtyFramesDuration[i];
    }

    if (accumulator === 0) {
      return 0;
    }
    return (1000 * 60) / accumulator;
  }

  /** Restores every timer and animation-frame function patched by this spy. */
  dispose(): void {
    for (let index = this.restoreFunctions.length - 1; index >= 0; index--) {
      this.restoreFunctions[index]?.();
    }
    this.restoreFunctions.length = 0;
    this.onFrameStart.clear();
    this.onFrameEnd.clear();
    this.onError.clear();
  }

  private init(): void {
    for (const Spy of TimeSpy.requestAnimationFrameFunctions) {
      this.spyRequestAnimationFrame(Spy, this.spiedWindow);
    }

    for (const Spy of TimeSpy.setTimerFunctions) {
      this.spySetTimer(Spy);
    }

    if (this.spiedWindow['VRDisplay']) {
      const onPresentChange = (event: any) => {
        this.spyRequestAnimationFrame('requestAnimationFrame', event.display);
      };
      this.spiedWindow.addEventListener('vrdisplaypresentchange', onPresentChange);
      this.restoreFunctions.push(() => {
        this.spiedWindow.removeEventListener('vrdisplaypresentchange', onPresentChange);
      });
    }
  }

  private spyRequestAnimationFrame(functionName: string, owner: any): void {
    const originalFunction = owner[functionName];
    if (typeof originalFunction !== 'function') return;

    // Needs both this.
    // tslint:disable-next-line
    const self = this;
    const patchedFunction = function () {
      const callback = arguments[0];
      const onCallback = self.getCallback(self, callback, () => {
        self.spiedWindow[functionName](callback);
      });

      return Reflect.apply(originalFunction, owner, [onCallback]);
    };
    owner[functionName] = patchedFunction;
    this.restoreFunctions.push(() => {
      if (owner[functionName] === patchedFunction) owner[functionName] = originalFunction;
    });
  }

  private spySetTimer(functionName: string): void {
    // Needs both this.
    // tslint:disable-next-line
    const self = this;
    const owner = this.spiedWindow;
    const needsReplay = functionName === 'setTimeout';
    const originalFunction = owner[functionName];
    if (typeof originalFunction !== 'function') return;

    // tslint:disable-next-line:only-arrow-functions
    const patchedFunction = function () {
      const callback = arguments[0];
      const time = arguments[1];
      const args = Array.prototype.slice.call(arguments);

      if (TimeSpy.setTimerCommonValues.indexOf(time) > -1) {
        args[0] = self.getCallback(
          self,
          callback,
          needsReplay
            ? () => {
                owner[functionName](callback);
              }
            : undefined
        );
      }

      return Reflect.apply(originalFunction, owner, args);
    };
    owner[functionName] = patchedFunction;
    this.restoreFunctions.push(() => {
      if (owner[functionName] === patchedFunction) owner[functionName] = originalFunction;
    });
  }

  private getCallback(self: TimeSpy, callback: any, skippedCalback?: () => void): Function {
    return function () {
      const now = Time.now;

      self.lastFrame = ++self.lastFrame % self.speedRatio;
      if (self.willPlayNextFrame || (self.speedRatio && !self.lastFrame)) {
        self.onFrameStart.trigger(self);
        try {
          callback.apply(self.spiedWindow, arguments);
        } catch (e) {
          self.onError.trigger(String(e));
        }
        self.lastSixtyFramesCurrentIndex = (self.lastSixtyFramesCurrentIndex + 1) % TimeSpy.fpsWindowSize;
        self.lastSixtyFramesDuration[self.lastSixtyFramesCurrentIndex] = now - self.lastSixtyFramesPreviousStart;
        self.onFrameEnd.trigger(self);
        self.willPlayNextFrame = false;
      } else {
        if (skippedCalback) {
          skippedCalback();
        }
      }

      self.lastSixtyFramesPreviousStart = now;
    };
  }
}
