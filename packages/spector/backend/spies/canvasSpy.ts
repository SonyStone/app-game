import { Observable } from '../../shared/utils/observable';
import { IContextInformation } from '../types/contextInformation';
import { OriginFunctionHelper } from '../utils/originFunctionHelper';

type CanvasConstructor = (new () => HTMLCanvasElement) | (new (...args: any[]) => OffscreenCanvas);

export class CanvasSpy {
  private readonly restores: Array<() => void> = [];

  readonly onContextRequested: Observable<IContextInformation>;

  constructor(private readonly canvas?: HTMLCanvasElement | OffscreenCanvas) {
    this.onContextRequested = new Observable<IContextInformation>();
    this.init();
  }

  /** Restores getContext only while this spy still owns the installed wrapper. */
  dispose(): void {
    for (const restore of this.restores.toReversed()) restore();
    this.restores.length = 0;
    this.onContextRequested.clear();
  }

  private init(): void {
    // Needs both this.
    // tslint:disable-next-line
    const self = this;

    const getContextSpied = function (this: HTMLCanvasElement | OffscreenCanvas) {
      const OriginalCanvasConstructor: CanvasConstructor =
        this instanceof HTMLCanvasElement ? HTMLCanvasElement : OffscreenCanvas;

      const context = self.canvas
        ? OriginFunctionHelper.executeOriginFunction(this, 'getContext', arguments)
        : OriginFunctionHelper.executePrototypeOriginFunction(this, OriginalCanvasConstructor, 'getContext', arguments);

      if (arguments.length > 0 && arguments[0] === '2d') {
        return context;
      }

      if (context) {
        const contextAttributes = Array.prototype.slice.call(arguments);
        const isWebgl2 = contextAttributes[0] === 'webgl2' || contextAttributes[0] === 'experimental-webgl2';

        const version = isWebgl2 ? 2 : 1;

        self.onContextRequested.trigger({
          context,
          contextVersion: version
        });
      }

      return context;
    };

    if (this.canvas) {
      OriginFunctionHelper.storeOriginFunction(this.canvas, 'getContext');
      const canvas = this.canvas;
      const original = canvas.getContext;
      canvas.getContext = getContextSpied;
      this.restores.push(() => {
        if (canvas.getContext === getContextSpied) canvas.getContext = original;
      });
    } else {
      OriginFunctionHelper.storePrototypeOriginFunction(HTMLCanvasElement, 'getContext');
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = getContextSpied;
      this.restores.push(() => {
        if (HTMLCanvasElement.prototype.getContext === getContextSpied)
          HTMLCanvasElement.prototype.getContext = original;
      });

      if (typeof OffscreenCanvas !== 'undefined') {
        OriginFunctionHelper.storePrototypeOriginFunction(OffscreenCanvas, 'getContext');
        const original = OffscreenCanvas.prototype.getContext;
        OffscreenCanvas.prototype.getContext = getContextSpied;
        this.restores.push(() => {
          if (OffscreenCanvas.prototype.getContext === getContextSpied) OffscreenCanvas.prototype.getContext = original;
        });
      }
    }
  }
}
