import type { InitCommand, PaintCommand, PaintEvent } from '@app-game/paint-core/protocol';
import { openWorker } from '@app-game/solid-gpu/worker/openWorker';
import type { WorkerFailure } from '@app-game/solid-gpu/worker/workerProtocol';
import { err, ok, type Result } from 'neverthrow';
import { engineError, type EngineError } from '../../shared/errors';
import { openLocalEngine } from './openLocalEngine';
import PaintWorker from './paint.worker?worker';

/**
 * Opens a drawing engine for one canvas and posts its `init` command. In `worker` mode the canvas is transferred to an
 * OffscreenCanvas owned by a module worker; in `main` mode the same engine runs on this thread with the DOM canvas.
 * The caller must `close()` the transport. Fails when the browser lacks the required APIs or the worker cannot start.
 */
export function openPaintTransport(
  mode: ExecutionMode,
  canvas: HTMLCanvasElement,
  init: EngineInit,
  handlers: EngineHandlers
): Result<PaintTransport, EngineError> {
  if (!navigator.gpu) {
    return err(engineError('unsupported', noWebGpuMessage));
  }

  if (mode === 'worker' && !canvas.transferControlToOffscreen) {
    return err(engineError('unsupported', noOffscreenCanvasMessage));
  }

  return mode === 'worker' ? openPaintWorker(canvas, init, handlers) : ok(openLocalEngine(canvas, init, handlers));
}

/** Where the drawing engine runs. Both modes execute the same recipe; `main` avoids Worker and OffscreenCanvas. */
export type ExecutionMode = 'worker' | 'main';

/** Commands accepted after `init`, which the transport posts itself with the mode-specific canvas. */
export type EngineCommand = Exclude<PaintCommand, { type: 'init' }>;

/** Serializable `init` options shared by both modes. */
export type EngineInit = Omit<InitCommand, 'type' | 'canvas'>;

/** Receives engine events and native transport failures. Callbacks must not throw. */
export type EngineHandlers = {
  message: (event: PaintEvent) => void;
  error: (failure: WorkerFailure) => void;
};

/** An open engine connection. */
export type PaintTransport = {
  /** Posts one command after `init`, in order. Posting after `close()` is ignored. */
  post: (command: EngineCommand) => Result<void, EngineError>;
  /**
   * Stops the engine: a worker is asked to shut down and terminated after a short grace period; the main-thread
   * engine releases its resources. Send `dispose` first and wait for `disposed` when the document must be saved.
   */
  close: () => void;
};

/** Names browsers that ship WebGPU, since iPad users on an older iPadOS see only a blank canvas otherwise. */
const noWebGpuMessage =
  'Paint needs WebGPU: Safari 26 or later (iPadOS 26, macOS), or a current Chrome or Edge with hardware acceleration enabled.';

const noOffscreenCanvasMessage =
  'Worker mode needs OffscreenCanvas. Turn off the worker in the Developer settings or update the browser.';

/** Starts the Vite module worker and transfers the canvas; the worker protocol only accepts an OffscreenCanvas. */
function openPaintWorker(
  canvas: HTMLCanvasElement,
  init: EngineInit,
  handlers: EngineHandlers
): Result<PaintTransport, EngineError> {
  const opened = openWorker<PaintCommand, PaintEvent>(() => new PaintWorker(), {
    message: ({ data }) => handlers.message(data),
    error: handlers.error
  });
  if (opened.isErr()) {
    return err(engineError('stopped', 'Could not start the drawing worker.', opened.error));
  }

  const worker = opened.value;
  const offscreen = canvas.transferControlToOffscreen();
  const started = worker.post({ type: 'init', canvas: offscreen, ...init }, [offscreen]);
  if (started.isErr()) {
    worker.close();
    return err(engineError('stopped', 'Could not start the drawing worker.', started.error));
  }

  return ok({
    post: (command) =>
      worker
        .post(command)
        .mapErr((failure) => engineError('stopped', 'Could not send the command to the drawing worker.', failure)),
    close: worker.close
  });
}
