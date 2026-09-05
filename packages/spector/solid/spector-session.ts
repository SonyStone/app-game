import type { Accessor } from 'solid-js';
import { createSignal } from 'solid-js';
import type { ContextSpy } from '../backend/spies/contextSpy';
import type { WebGLRenderingContexts } from '../backend/types/contextInformation';
import type { ICapture } from '../shared/capture/capture';
import { Spector, type IAvailableContext } from '../spector';

/** Capture options shared by canvas and registered-context capture requests. */
export interface SpectorCaptureOptions {
  /** Stops after this many commands. Zero records one animation frame. */
  readonly commandCount?: number;
  /** Skips expensive visual state collection. */
  readonly quickCapture?: boolean;
  /** Includes transient state normally omitted from captures. */
  readonly fullCapture?: boolean;
}

/** Observable state for one Spector engine and its capture history. */
export type SpectorSessionStatus =
  | { readonly type: 'idle' }
  | { readonly type: 'capturing' }
  | { readonly type: 'captured'; readonly commandCount: number }
  | { readonly type: 'error'; readonly message: string };

/** Shader sources submitted for live program recompilation. */
export interface SpectorProgramSource {
  readonly programId: number;
  readonly vertex: string;
  readonly fragment: string;
}

/**
 * Solid-facing interface for capture history, context registration, playback, and shader recompilation.
 * Disposing the session also disposes its Spector engine.
 */
export interface SpectorSession {
  readonly captures: Accessor<readonly ICapture[]>;
  readonly contexts: Accessor<readonly IAvailableContext[]>;
  readonly status: Accessor<SpectorSessionStatus>;
  readonly spector: Spector;
  addCapture(capture: ICapture): void;
  registerContext(context: WebGLRenderingContexts): IAvailableContext;
  captureContext(context?: IAvailableContext, options?: SpectorCaptureOptions): void;
  captureCanvas(canvas: HTMLCanvasElement | OffscreenCanvas, options?: SpectorCaptureOptions): void;
  rebuildProgram(source: SpectorProgramSource): Promise<void>;
  pause(): void;
  play(): void;
  playNextFrame(): void;
  getFps(): number;
  dispose(): void;
}

/** Creates the single Solid session used by embedded and overlay Spector frontends. */
export function createSpectorSession(spector: Spector = new Spector()): SpectorSession {
  const [captures, setCaptures] = createSignal<readonly ICapture[]>([]);
  const [contexts, setContexts] = createSignal<readonly IAvailableContext[]>(spector.getAvailableContexts());
  const [status, setStatus] = createSignal<SpectorSessionStatus>({ type: 'idle' });

  const captureStartedSubscription = spector.onCaptureStarted.add(() => setStatus({ type: 'capturing' }));
  const captureSubscription = spector.onCapture.add((capture) => {
    setCaptures((current) => [capture, ...current]);
    setStatus({ type: 'captured', commandCount: capture.commands.length });
  });
  const errorSubscription = spector.onError.add((message) => setStatus({ type: 'error', message }));

  return {
    captures,
    contexts,
    status,
    spector,
    addCapture(capture) {
      setCaptures((current) => [capture, ...current]);
      setStatus({ type: 'captured', commandCount: capture.commands.length });
    },
    registerContext(context) {
      const availableContext = spector.spyContext(context);
      setContexts(spector.getAvailableContexts());
      return availableContext;
    },
    captureContext(context = contexts()[0], options = {}) {
      if (!context || status().type === 'capturing') return;
      setStatus({ type: 'capturing' });
      captureContextSpy(spector, context.contextSpy, options);
    },
    captureCanvas(canvas, options = {}) {
      if (status().type === 'capturing') return;
      setStatus({ type: 'capturing' });
      spector.captureCanvas(
        canvas,
        options.commandCount ?? 0,
        options.quickCapture ?? false,
        options.fullCapture ?? false
      );
      setContexts(spector.getAvailableContexts());
    },
    rebuildProgram(source) {
      return new Promise<void>((resolve, reject) => {
        spector.rebuildProgramFromProgramId(
          source.programId,
          source.vertex,
          source.fragment,
          (program) => {
            spector.referenceNewProgram(source.programId, program);
            resolve();
          },
          (message) => reject(new Error(message))
        );
      });
    },
    pause: () => spector.pause(),
    play: () => spector.play(),
    playNextFrame: () => spector.playNextFrame(),
    getFps: () => spector.getFps(),
    dispose() {
      spector.onCaptureStarted.remove(captureStartedSubscription);
      spector.onCapture.remove(captureSubscription);
      spector.onError.remove(errorSubscription);
      spector.dispose();
      setContexts([]);
    }
  };
}

function captureContextSpy(spector: Spector, contextSpy: ContextSpy, options: SpectorCaptureOptions): void {
  spector.captureContextSpy(
    contextSpy,
    options.commandCount ?? 0,
    options.quickCapture ?? false,
    options.fullCapture ?? false
  );
}
