import type { ICapture, IMeshCapture, ISceneCapture, ITextureCapture } from '@app-game/spector';
import { Spector } from '@app-game/spector/spector';
import {
  AGENT_STATUS_MESSAGE,
  AGENT_VERSION,
  type AgentResponse,
  type AgentSnapshot,
  type CanvasSnapshot,
  type CaptureRequest,
  type PageAgent
} from './protocol';

/** Owns capture state and patches in one page realm. Dispose before replacing it. */
export function createPageAgent(): PageAgent {
  const spector = new Spector({ target: window });
  const canvasIds = new WeakMap<HTMLCanvasElement, number>();
  let nextCanvasId = 1;
  let activeCanvasId: number | undefined;
  let captureRevision = 0;
  let latestCapture = '';
  let latestCaptureObject: ICapture | undefined;
  let latestCaptureContext: WebGLRenderingContext | WebGL2RenderingContext | undefined;
  let activeContext: WebGLRenderingContext | WebGL2RenderingContext | undefined;
  let restoreActivityMonitor: (() => void) | undefined;
  let finalizeTimer: ReturnType<typeof setTimeout> | undefined;
  let publishTimer: ReturnType<typeof setTimeout> | undefined;
  let status: AgentSnapshot['status'] = { type: 'idle' };
  let statusRevision = 0;

  spector.spyCanvases();
  spector.onCaptureStarted.add(() => {
    if (activeCanvasId !== undefined) {
      setStatus({ type: 'capturing', canvasId: activeCanvasId, commandCount: 0 });
    }
  });
  spector.onCaptureProgress.add((commandCount) => {
    if (activeCanvasId !== undefined && status.type === 'capturing') {
      setStatus({ type: 'capturing', canvasId: activeCanvasId, commandCount }, false);
      if (commandCount === 1 || commandCount % CAPTURE_PROGRESS_MESSAGE_INTERVAL === 0) notifyStatus();
    }
  });
  spector.onCapture.add((capture) => {
    restoreActivityMonitor?.();
    restoreActivityMonitor = undefined;
    const canvasId = activeCanvasId ?? 0;
    const context = activeContext;
    setStatus({ type: 'processing', canvasId, commandCount: capture.commands.length });
    publishTimer = setTimeout(() => {
      publishTimer = undefined;
      try {
        latestCapture = JSON.stringify(capture);
      } catch (error: unknown) {
        setStatus({ type: 'error', message: errorMessage(error) });
        activeCanvasId = undefined;
        activeContext = undefined;
        return;
      }
      latestCaptureObject = capture;
      latestCaptureContext = context;
      captureRevision++;
      setStatus({ type: 'captured', canvasId, commandCount: capture.commands.length });
      activeCanvasId = undefined;
      activeContext = undefined;
    }, CAPTURE_PUBLISH_DELAY_MS);
  });
  spector.onError.add((message) => {
    clearPendingTimers();
    restoreActivityMonitor?.();
    restoreActivityMonitor = undefined;
    setStatus({ type: 'error', message });
    activeCanvasId = undefined;
    activeContext = undefined;
  });

  const agent: PageAgent = {
    version: AGENT_VERSION,
    dispose: () => {
      clearPendingTimers();
      restoreActivityMonitor?.();
      restoreActivityMonitor = undefined;
      spector.dispose();
    },
    inspect: () => respond(readSnapshot()),
    capture: (request) => startCapture(request),
    stop: () => stopCapture(),
    readCapture: (revision) =>
      revision === captureRevision && latestCapture
        ? respond(latestCapture)
        : fail(`Capture ${revision} is no longer available.`),
    readMesh: (revision, commandId, attributeName) => readMesh(revision, commandId, attributeName),
    readScene: (revision) => readScene(revision),
    readTexture: (revision, commandId, uniformIndex, textureIndex) =>
      readTexture(revision, commandId, uniformIndex, textureIndex),
    compile: (revision, programId, vertex, fragment) => compileProgram(revision, programId, vertex, fragment)
  };

  return agent;

  function readSnapshot(): AgentSnapshot {
    return {
      version: AGENT_VERSION,
      documentTitle: document.title,
      documentUrl: location.href,
      canvases: Array.from(document.querySelectorAll('canvas'), readCanvas),
      status,
      statusRevision,
      captureRevision
    };
  }

  function readCanvas(canvas: HTMLCanvasElement, index: number): CanvasSnapshot {
    let canvasId = canvasIds.get(canvas);
    if (canvasId === undefined) {
      canvasId = nextCanvasId++;
      canvasIds.set(canvas, canvasId);
    }

    const context = spector.getAvailableContexts().find((available) => available.canvas === canvas)?.contextSpy;
    const rect = canvas.getBoundingClientRect();
    return {
      id: canvasId,
      label: canvasLabel(canvas, index),
      width: canvas.width,
      height: canvas.height,
      clientWidth: Math.round(rect.width),
      clientHeight: Math.round(rect.height),
      context: context?.version === 2 ? 'WebGL 2' : context?.version === 1 ? 'WebGL 1' : 'Not observed',
      visible: rect.width > 0 && rect.height > 0 && getComputedStyle(canvas).visibility !== 'hidden'
    };
  }

  function startCapture(request: CaptureRequest): string {
    if (!isCaptureRequest(request)) return fail('The capture request is invalid.');
    if (status.type === 'waiting' || status.type === 'capturing' || status.type === 'processing') {
      return fail('A capture is already armed or running in this frame.');
    }

    const canvas = findCanvas(request.canvasId);
    if (!canvas) return fail('The selected canvas is no longer on the page.');

    try {
      const context = Spector.getFirstAvailable3dContext(canvas);
      if (!context) return fail('This canvas does not have a WebGL context.');
      activeCanvasId = request.canvasId;
      activeContext = context;
      if (request.commandCount === 0) {
        setStatus({ type: 'waiting', canvasId: request.canvasId });
        restoreActivityMonitor = waitForWebGLActivity(context);
      } else {
        setStatus({ type: 'capturing', canvasId: request.canvasId, commandCount: 0 });
        spector.captureContext(context, request.commandCount, false, false);
      }
      return respond(undefined);
    } catch (error: unknown) {
      activeCanvasId = undefined;
      activeContext = undefined;
      const message = errorMessage(error);
      setStatus({ type: 'error', message });
      return fail(message);
    }
  }

  function stopCapture(): string {
    try {
      if (status.type === 'processing') return respond(false);
      if (finalizeTimer !== undefined) {
        clearTimeout(finalizeTimer);
        finalizeTimer = undefined;
      }
      restoreActivityMonitor?.();
      restoreActivityMonitor = undefined;
      const capture = spector.stopCapture();
      if (!capture && (status.type === 'waiting' || status.type === 'capturing')) {
        setStatus({ type: 'idle' });
        activeCanvasId = undefined;
        activeContext = undefined;
      }
      return respond(capture !== undefined);
    } catch (error: unknown) {
      const message = errorMessage(error);
      setStatus({ type: 'error', message });
      return fail(message);
    }
  }

  function waitForWebGLActivity(context: WebGLRenderingContext | WebGL2RenderingContext): () => void {
    const restores: Array<() => void> = [];
    let restored = false;

    for (const name in context) {
      const method: unknown = context[name as keyof typeof context];
      if (typeof method !== 'function') continue;

      const original = method as (this: WebGLRenderingContext | WebGL2RenderingContext, ...args: unknown[]) => unknown;
      const monitored = function (this: WebGLRenderingContext | WebGL2RenderingContext, ...args: unknown[]) {
        const startsCapture = status.type === 'waiting';
        if (startsCapture) beginCapture();
        try {
          return Reflect.apply(original, context, args);
        } finally {
          if (startsCapture) queueMicrotask(finishRecording);
        }
      };

      try {
        (context as unknown as Record<string, unknown>)[name] = monitored;
        restores.push(() => {
          if ((context as unknown as Record<string, unknown>)[name] === monitored) {
            (context as unknown as Record<string, unknown>)[name] = original;
          }
        });
      } catch {
        // Some browser-provided members may be callable but not replaceable.
      }
    }

    return restore;

    function beginCapture(): void {
      restore();
      restoreActivityMonitor = undefined;
      if (activeCanvasId === undefined) return;
      setStatus({ type: 'capturing', canvasId: activeCanvasId, commandCount: 0 });
      try {
        spector.captureContext(context, 10000, false, false);
      } catch (error: unknown) {
        setStatus({ type: 'error', message: errorMessage(error) });
        activeCanvasId = undefined;
        activeContext = undefined;
      }
    }

    function finishRecording(): void {
      if (status.type !== 'capturing') return;
      const canvasId = status.canvasId;
      const commandCount = spector.suspendCapture();
      setStatus({ type: 'processing', canvasId, commandCount });
      finalizeTimer = setTimeout(finalizeCapture, CAPTURE_FINALIZE_DELAY_MS);
    }

    function finalizeCapture(): void {
      finalizeTimer = undefined;
      if (status.type !== 'processing') return;
      const capture = spector.stopCapture();
      if (capture) return;
      setStatus({ type: 'error', message: 'The WebGL activity ended before any calls could be recorded.' });
      activeCanvasId = undefined;
      activeContext = undefined;
    }

    function restore(): void {
      if (restored) return;
      restored = true;
      for (let index = restores.length - 1; index >= 0; index--) restores[index]?.();
      restores.length = 0;
    }
  }

  function clearPendingTimers(): void {
    if (finalizeTimer !== undefined) clearTimeout(finalizeTimer);
    if (publishTimer !== undefined) clearTimeout(publishTimer);
    finalizeTimer = undefined;
    publishTimer = undefined;
  }

  function readMesh(revision: number, commandId: number, attributeName?: string): string {
    if (revision !== captureRevision || !latestCaptureObject || !latestCaptureContext) {
      return respond<IMeshCapture>({
        status: 'unavailable',
        commandId,
        reason: 'Live mesh data is only available for the newest capture in this frame.'
      });
    }
    const command = latestCaptureObject.commands.find((candidate) => candidate.id === commandId);
    if (!command) return fail(`Command ${commandId} is not part of capture ${revision}.`);
    return respond(spector.captureMesh(latestCaptureContext, command, attributeName));
  }

  function readScene(revision: number): string {
    if (revision !== captureRevision || !latestCaptureObject || !latestCaptureContext) {
      return respond<ISceneCapture>({
        status: 'unavailable',
        reason: 'Scene previews are only available for the newest live capture in this frame.'
      });
    }
    return respond(spector.captureScene(latestCaptureContext, latestCaptureObject.commands));
  }

  function readTexture(revision: number, commandId: number, uniformIndex: number, textureIndex: number): string {
    if (revision !== captureRevision || !latestCaptureObject || !latestCaptureContext) {
      return respond<ITextureCapture>({
        status: 'unavailable',
        commandId,
        uniformIndex,
        textureIndex,
        reason: 'Live texture data is only available for the newest capture in this frame.'
      });
    }
    const command = latestCaptureObject.commands.find((candidate) => candidate.id === commandId);
    if (!command) return fail(`Command ${commandId} is not part of capture ${revision}.`);
    return respond(spector.captureTexture(latestCaptureContext, command, uniformIndex, textureIndex));
  }

  function setStatus(nextStatus: AgentSnapshot['status'], shouldNotify = true): void {
    status = nextStatus;
    statusRevision++;
    if (shouldNotify) notifyStatus();
  }

  function notifyStatus(): void {
    window.postMessage({ type: AGENT_STATUS_MESSAGE, status, statusRevision, captureRevision }, '*');
  }

  async function compileProgram(
    revision: number,
    programId: number,
    vertex: string,
    fragment: string
  ): Promise<string> {
    if (revision !== captureRevision || status.type !== 'captured') {
      return fail('Shader editing requires the newest completed live capture in this document.');
    }
    return new Promise((resolve) => {
      spector.rebuildProgramFromProgramId(
        programId,
        vertex,
        fragment,
        (program) => {
          spector.referenceNewProgram(programId, program);
          resolve(respond(undefined));
        },
        (message) => resolve(fail(message))
      );
    });
  }

  function findCanvas(canvasId: number): HTMLCanvasElement | undefined {
    return Array.from(document.querySelectorAll('canvas')).find((canvas) => canvasIds.get(canvas) === canvasId);
  }
}

function canvasLabel(canvas: HTMLCanvasElement, index: number): string {
  if (canvas.id) return `#${canvas.id}`;
  const classes = Array.from(canvas.classList).slice(0, 3);
  if (classes.length > 0) return `.${classes.join('.')}`;
  const accessibleName = canvas.getAttribute('aria-label') || canvas.getAttribute('title');
  return accessibleName || `canvas ${index + 1}`;
}

function isCaptureRequest(value: CaptureRequest): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    Number.isInteger(value.canvasId) &&
    Number.isInteger(value.commandCount) &&
    value.commandCount >= 0 &&
    value.commandCount <= 10000
  );
}

function respond<T>(value: T): string {
  return JSON.stringify({ ok: true, value } satisfies AgentResponse<T>);
}

function fail(error: string): string {
  return JSON.stringify({ ok: false, error } satisfies AgentResponse<never>);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const CAPTURE_FINALIZE_DELAY_MS = 600;
const CAPTURE_PUBLISH_DELAY_MS = 300;
const CAPTURE_PROGRESS_MESSAGE_INTERVAL = 50;
