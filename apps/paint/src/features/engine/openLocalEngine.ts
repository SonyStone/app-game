import type { PaintRuntimeCommand } from '@app-game/paint-core/protocol';
import { ok, Result } from 'neverthrow';
import { engineError } from '../../shared/errors';
import type { EngineCommand, EngineHandlers, EngineInit, PaintTransport } from './openPaintTransport';
import type { createStudioRuntime } from './StudioApplication';

/**
 * Runs the Studio engine on the main thread, drawing into the DOM canvas without a Worker or OffscreenCanvas. The
 * engine module loads on demand, so commands posted before it loads, including `init`, are queued in order. Messages
 * are cloned in both directions, as at a worker boundary, so UI and document state never alias.
 */
export function openLocalEngine(canvas: HTMLCanvasElement, init: EngineInit, handlers: EngineHandlers): PaintTransport {
  let runtime: ReturnType<typeof createStudioRuntime> | undefined;
  let closed = false;
  const queued: PaintRuntimeCommand[] = [];
  deliver({ type: 'init', canvas, ...structuredClone(init) });
  // `catch` also reports a runtime that throws while starting, not only a module that fails to load.
  void import('./StudioApplication').then(start).catch((cause: unknown) => {
    if (!closed) {
      handlers.error({ kind: 'create', cause });
    }
  });

  return {
    post(command: EngineCommand) {
      if (closed) {
        return ok();
      }

      return Result.fromThrowable(
        () => structuredClone(command),
        (cause) => engineError('stopped', 'Could not send the command to the drawing engine.', cause)
      )().map(deliver);
    },
    close
  };

  function start({ createStudioRuntime }: typeof import('./StudioApplication')) {
    if (closed) {
      return;
    }

    const started = createStudioRuntime((event) => {
      if (!closed) {
        handlers.message(structuredClone(event));
      }
    }, close);
    runtime = started;
    for (const command of queued.splice(0)) {
      started.send(command);
    }
  }

  function deliver(command: PaintRuntimeCommand) {
    if (runtime) {
      runtime.send(command);
    } else {
      queued.push(command);
    }
  }

  /** Releases the runtime; also called by the runtime itself after a `dispose` command has saved the document. */
  function close() {
    if (closed) {
      return;
    }

    closed = true;
    queued.length = 0;
    runtime?.terminate();
  }
}
