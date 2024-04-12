import { IContextInformation, WebGLRenderingContexts } from './backend/types/contextInformation';

import { ICapture } from './shared/capture/capture';

import { CanvasSpy } from './backend/spies/canvasSpy';
import { ContextSpy } from './backend/spies/contextSpy';
import { TimeSpy } from './backend/spies/timeSpy';
import { ProgramRecompilerHelper } from './backend/utils/programRecompilerHelper';
import { Program } from './backend/webGlObjects/webGlObjects';
import { CaptureMenu } from './embeddedFrontend/captureMenu/captureMenu';
import { ResultView } from './embeddedFrontend/resultView/resultView';
import { Logger } from './shared/utils/logger';
import { Observable } from './shared/utils/observable';

const CAPTURE_LIMIT = 10000; // Limit command count to 10000 record (to be kept in sync with the documentation)

type Timeout = ReturnType<typeof setTimeout>;
const DEFOULT_TIMEOUT = -1 as any as Timeout;

export interface IAvailableContext {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly contextSpy: ContextSpy;
}

export const EmbeddedFrontend = {
  CaptureMenu,
  ResultView
};

interface IAnnotatedOffscreenCanvas extends OffscreenCanvas {
  __spector_context_type?: string;
}

export class Spector {
  static getFirstAvailable3dContext(canvas: HTMLCanvasElement | OffscreenCanvas): WebGLRenderingContexts | undefined {
    // Custom detection to run in the extension.
    return (
      this.tryGetContextFromHelperField(canvas) ||
      this.tryGetContextFromCanvas(canvas, 'webgl') ||
      this.tryGetContextFromCanvas(canvas, 'experimental-webgl') ||
      this.tryGetContextFromCanvas(canvas, 'webgl2') ||
      this.tryGetContextFromCanvas(canvas, 'experimental-webgl2')
    );
  }

  private static tryGetContextFromHelperField(
    canvas: HTMLCanvasElement | OffscreenCanvas
  ): WebGLRenderingContexts | undefined {
    const type =
      canvas instanceof HTMLCanvasElement
        ? canvas.getAttribute('__spector_context_type')
        : (canvas as IAnnotatedOffscreenCanvas).__spector_context_type;

    if (type) {
      return this.tryGetContextFromCanvas(canvas, type);
    }

    return undefined;
  }

  private static tryGetContextFromCanvas(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    type: string
  ): WebGLRenderingContexts | undefined {
    try {
      // Cast canvas to any because lib.dom.d.ts types are not suitably
      // general to allow for custom canvas context types that are
      // potentially specified by __spector_context_type:
      return (canvas as any).getContext(type) as WebGLRenderingContexts;
    } catch (e) {
      // Nothing to do here, canvas has not been found.;
    }

    return undefined;
  }

  readonly onCaptureStarted: Observable<any>;
  readonly onCapture: Observable<ICapture>;
  readonly onError: Observable<string>;

  private readonly timeSpy: TimeSpy;
  private readonly contexts: IAvailableContext[];

  private canvasSpy?: CanvasSpy;
  private captureNextFrames: number;
  private captureNextCommands: number;
  private quickCapture: boolean;
  private fullCapture: boolean;
  private capturingContext?: ContextSpy;
  private captureMenu?: CaptureMenu;
  private resultView?: ResultView;
  private retry: number;
  private noFrameTimeout = DEFOULT_TIMEOUT;
  private marker?: string;

  constructor() {
    this.captureNextFrames = 0;
    this.captureNextCommands = 0;
    this.quickCapture = false;
    this.fullCapture = false;
    this.retry = 0;
    this.contexts = [];

    this.timeSpy = new TimeSpy();
    this.onCaptureStarted = new Observable<ICapture>();
    this.onCapture = new Observable<ICapture>();
    this.onError = new Observable<string>();

    this.timeSpy.onFrameStart.add(this.onFrameStart, this);
    this.timeSpy.onFrameEnd.add(this.onFrameEnd, this);
    this.timeSpy.onError.add(this.onErrorInternal, this);
  }

  displayUI(disableTracking: boolean = false) {
    if (!this.captureMenu) {
      this.getCaptureUI();

      const captureMenu = this.captureMenu!;

      captureMenu.onPauseRequested.add(this.pause, this);
      captureMenu.onPlayRequested.add(this.play, this);
      captureMenu.onPlayNextFrameRequested.add(this.playNextFrame, this);
      captureMenu.onCaptureRequested.add((info) => {
        if (info) {
          this.captureCanvas(info.ref);
        }
      }, this);

      setInterval(() => {
        captureMenu.setFPS(this.getFps());
      }, 1000);

      if (!disableTracking) {
        captureMenu.trackPageCanvases();
      }

      captureMenu.display();
    }

    if (!this.resultView) {
      this.getResultUI();

      const resultView = this.resultView!;

      this.onCapture.add((capture) => {
        resultView.display();
        resultView.addCapture(capture);
      });
    }
  }

  getResultUI(): ResultView {
    if (!this.resultView) {
      this.resultView = new ResultView();
      this.resultView.onSourceCodeChanged.add((sourceCodeEvent) => {
        this.rebuildProgramFromProgramId(
          sourceCodeEvent.programId,
          sourceCodeEvent.sourceVertex,
          sourceCodeEvent.sourceFragment,
          (program) => {
            this.referenceNewProgram(sourceCodeEvent.programId, program);
            this.resultView!.showSourceCodeError();
          },
          (error) => {
            this.resultView!.showSourceCodeError(error);
          }
        );
      });
    }
    return this.resultView;
  }

  getCaptureUI(): CaptureMenu {
    if (!this.captureMenu) {
      this.captureMenu = new CaptureMenu();
    }
    return this.captureMenu;
  }

  rebuildProgramFromProgramId(
    programId: number,
    vertexSourceCode: string,
    fragmentSourceCode: string,
    onCompiled: (program: WebGLProgram) => void,
    onError: (message: string) => void
  ) {
    const program = Program.getFromGlobalStore(programId);

    this.rebuildProgram(program, vertexSourceCode, fragmentSourceCode, onCompiled, onError);
  }

  rebuildProgram(
    program: WebGLProgram,
    vertexSourceCode: string,
    fragmentSourceCode: string,
    onCompiled: (program: WebGLProgram) => void,
    onError: (message: string) => void
  ) {
    ProgramRecompilerHelper.rebuildProgram(program, vertexSourceCode, fragmentSourceCode, onCompiled, onError);
  }

  referenceNewProgram(programId: number, program: WebGLProgram): void {
    Program.updateInGlobalStore(programId, program);
  }

  pause(): void {
    this.timeSpy.changeSpeedRatio(0);
  }

  play(): void {
    this.timeSpy.changeSpeedRatio(1);
  }

  playNextFrame(): void {
    this.timeSpy.playNextFrame();
  }

  drawOnlyEveryXFrame(x: number): void {
    this.timeSpy.changeSpeedRatio(x);
  }

  getFps(): number {
    return this.timeSpy.getFps();
  }

  spyCanvases(): void {
    if (this.canvasSpy) {
      this.onErrorInternal('Already spying canvas.');
      return;
    }

    this.canvasSpy = new CanvasSpy();
    this.canvasSpy.onContextRequested.add(this.spyContext, this);
  }

  spyCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): void {
    if (this.canvasSpy) {
      this.onErrorInternal('Already spying canvas.');
      return;
    }

    this.canvasSpy = new CanvasSpy(canvas);
    this.canvasSpy.onContextRequested.add(this.spyContext, this);
  }

  getAvailableContexts(): IAvailableContext[] {
    return this.getAvailableContexts();
  }

  captureCanvas(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    commandCount = 0,
    quickCapture: boolean = false,
    fullCapture: boolean = false
  ): void {
    const contextSpy = this.getAvailableContextSpyByCanvas(canvas);
    if (!contextSpy) {
      const context = Spector.getFirstAvailable3dContext(canvas);
      if (context) {
        this.captureContext(context, commandCount, quickCapture, fullCapture);
      } else {
        Logger.error('No webgl context available on the chosen canvas.');
      }
    } else {
      this.captureContextSpy(contextSpy, commandCount, quickCapture, fullCapture);
    }
  }

  captureContext(
    context: WebGLRenderingContexts,
    commandCount = 0,
    quickCapture: boolean = false,
    fullCapture: boolean = false
  ): void {
    let contextSpy = this.getAvailableContextSpyByCanvas(context.canvas as HTMLCanvasElement | OffscreenCanvas);

    if (!contextSpy) {
      if ((context as WebGL2RenderingContext).getIndexedParameter) {
        contextSpy = new ContextSpy({
          context,
          version: 2,
          recordAlways: false
        });
      } else {
        contextSpy = new ContextSpy({
          context,
          version: 1,
          recordAlways: false
        });
      }

      contextSpy.onMaxCommand.add(this.stopCapture, this);

      this.contexts.push({
        canvas: contextSpy.context.canvas as HTMLCanvasElement | OffscreenCanvas,
        contextSpy
      });
    }

    if (contextSpy) {
      this.captureContextSpy(contextSpy, commandCount, quickCapture, fullCapture);
    }
  }

  captureContextSpy(
    contextSpy: ContextSpy,
    commandCount = 0,
    quickCapture: boolean = false,
    fullCapture: boolean = false
  ): void {
    this.quickCapture = quickCapture;
    this.fullCapture = fullCapture;

    if (this.capturingContext) {
      this.onErrorInternal('Already capturing a context.');
    } else {
      this.retry = 0;
      this.capturingContext = contextSpy;
      this.capturingContext.setMarker(this.marker!);

      // Limit the shown command count
      commandCount = Math.min(commandCount, CAPTURE_LIMIT);
      if (commandCount > 0) {
        this.captureCommands(commandCount);
      } else {
        // Capture only one frame.
        this.captureFrames(1);
      }

      this.noFrameTimeout = setTimeout(() => {
        if (commandCount > 0) {
          this.stopCapture();
        } else if (this.capturingContext && this.retry > 1) {
          this.onErrorInternal('No frames with gl commands detected. Try moving the camera.');
        } else {
          this.onErrorInternal('No frames detected. Try moving the camera or implementing requestAnimationFrame.');
        }
      }, 10 * 1000);
    }
  }

  captureNextFrame(
    obj: HTMLCanvasElement | OffscreenCanvas | WebGLRenderingContexts,
    quickCapture: boolean = false,
    fullCapture: boolean = false
  ): void {
    if (obj instanceof HTMLCanvasElement || (self.OffscreenCanvas && obj instanceof OffscreenCanvas)) {
      this.captureCanvas(obj, 0, quickCapture, fullCapture);
    } else {
      this.captureContext(obj as WebGLRenderingContexts, 0, quickCapture, fullCapture);
    }
  }

  startCapture(
    obj: HTMLCanvasElement | OffscreenCanvas | WebGLRenderingContexts,
    commandCount: number,
    quickCapture: boolean = false,
    fullCapture: boolean = false
  ): void {
    if (obj instanceof HTMLCanvasElement || (self.OffscreenCanvas && obj instanceof OffscreenCanvas)) {
      this.captureCanvas(obj, commandCount, quickCapture, fullCapture);
    } else {
      this.captureContext(obj as WebGLRenderingContexts, commandCount, quickCapture, fullCapture);
    }
  }

  stopCapture(): ICapture | undefined {
    if (this.capturingContext) {
      const capture = this.capturingContext.stopCapture();
      if (capture.commands.length > 0) {
        if (this.noFrameTimeout > DEFOULT_TIMEOUT) {
          clearTimeout(this.noFrameTimeout);
        }
        this.triggerCapture(capture);

        this.capturingContext = undefined;
        this.captureNextFrames = 0;
        this.captureNextCommands = 0;
        return capture;
      } else if (this.captureNextCommands === 0) {
        this.retry++;
        this.captureFrames(1);
      }
    }
    return undefined;
  }

  setMarker(marker: string): void {
    this.marker = marker;
    if (this.capturingContext) {
      this.capturingContext.setMarker(marker);
    }
  }

  clearMarker(): void {
    this.marker = undefined;
    if (this.capturingContext) {
      this.capturingContext.clearMarker();
    }
  }

  log(value: string): void {
    if (this.capturingContext) {
      this.capturingContext.log(value);
    }
  }

  private captureFrames(frameCount: number): void {
    this.captureNextFrames = frameCount;
    this.captureNextCommands = 0;

    this.playNextFrame();
  }

  private captureCommands(commandCount: number): void {
    this.captureNextFrames = 0;
    this.captureNextCommands = commandCount;

    this.play();

    if (this.capturingContext) {
      this.onCaptureStarted.trigger(undefined);
      this.capturingContext.startCapture(commandCount, this.quickCapture, this.fullCapture);
    } else {
      this.onErrorInternal('No context to capture from.');
      this.captureNextCommands = 0;
    }
  }

  private spyContext(contextInformation: IContextInformation) {
    let contextSpy = this.getAvailableContextSpyByCanvas(
      contextInformation.context.canvas as HTMLCanvasElement | OffscreenCanvas
    );
    if (!contextSpy) {
      contextSpy = new ContextSpy({
        context: contextInformation.context,
        version: contextInformation.contextVersion,
        recordAlways: true
      });

      contextSpy.onMaxCommand.add(this.stopCapture, this);

      this.contexts.push({
        canvas: contextSpy.context.canvas as HTMLCanvasElement | OffscreenCanvas,
        contextSpy
      });
    }

    contextSpy.spy();
  }

  private getAvailableContextSpyByCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): ContextSpy | undefined {
    for (const availableContext of this.contexts) {
      if (availableContext.canvas === canvas) {
        return availableContext.contextSpy;
      }
    }
    return undefined;
  }

  private onFrameStart(): void {
    if (this.captureNextCommands > 0) {
      // Nothing to do here but preventing to drop the capturing context.
    } else if (this.captureNextFrames > 0) {
      if (this.capturingContext) {
        this.onCaptureStarted.trigger(undefined);
        this.capturingContext.startCapture(0, this.quickCapture, this.fullCapture);
      }
      this.captureNextFrames--;
    } else {
      this.capturingContext = undefined;
    }
  }

  private onFrameEnd(): void {
    if (this.captureNextCommands > 0) {
      // Nothing to do here but preventing to drop the capturing context.
    } else if (this.captureNextFrames === 0) {
      this.stopCapture();
    }
  }

  private triggerCapture(capture: ICapture) {
    if (this.captureMenu) {
      this.captureMenu.captureComplete();
    }
    this.onCapture.trigger(capture);
  }

  private onErrorInternal(error: string) {
    Logger.error(error);
    if (this.noFrameTimeout > (-1 as any as Timeout)) {
      clearTimeout(this.noFrameTimeout);
    }

    if (this.capturingContext) {
      this.capturingContext = undefined;
      this.captureNextFrames = 0;
      this.captureNextCommands = 0;
      this.retry = 0;

      if (this.captureMenu) {
        this.captureMenu.captureComplete(error);
      }
      this.onError.trigger(error);
    } else {
      throw error;
    }
  }
}
