import type { AbortedError, GpuError } from '@app-game/solid-gpu/errors';

/**
 * Expected editor failures. Callers branch on `kind` and `code` instead of parsing `message`; `cause` keeps the
 * original exception, worker failure or runtime event for diagnostics. Renderer failures reported by the engine reuse
 * `GpuError`, and work cancelled by editor disposal resolves `AbortedError`, both from `@app-game/solid-gpu/errors`.
 */
export type PaintError = EngineError | BrushError | FullscreenError | InstallError | GpuError | AbortedError;

/** Drawing-engine transport and command failures. */
export type EngineError = {
  kind: 'engine';
  /**
   * - `unsupported`: the browser lacks WebGPU, or OffscreenCanvas in worker mode.
   * - `stopped`: the worker or the main-thread engine failed to start or crashed.
   * - `failed`: the engine rejected a document command, for example an invalid file or full storage.
   * - `busy`: another drawing, selection or brush operation must finish first; retrying later can succeed.
   * - `disconnected`: the engine was replaced or closed before it replied.
   * - `timeout`: the engine did not reply within the request budget.
   */
  code: 'unsupported' | 'stopped' | 'failed' | 'busy' | 'disconnected' | 'timeout';
  message: string;
  cause?: unknown;
};

/** Preserves the original cause for diagnostics while exposing a stable engine error code. */
export function engineError(code: EngineError['code'], message: string, cause?: unknown): EngineError {
  return { kind: 'engine', code, message, cause };
}

/** Brush preset and brush command failures. */
export type BrushError = {
  kind: 'brush';
  /**
   * - `invalid-preset`: the preset has no primary tip.
   * - `upload`: the engine rejected a tip, texture or dual-brush resource.
   * - `command`: the engine rejected a brush command such as a Mixer Brush load.
   * - `restore`: the selected preset could not be uploaded to a replacement engine; restoring the renderer retries.
   */
  code: 'invalid-preset' | 'upload' | 'command' | 'restore';
  message: string;
  cause?: unknown;
};

/** Preserves the original cause for diagnostics while exposing a stable brush error code. */
export function brushError(code: BrushError['code'], message: string, cause?: unknown): BrushError {
  return { kind: 'brush', code, message, cause };
}

/** The browser refused to enter or leave fullscreen. Drawing state is unaffected. */
export type FullscreenError = { kind: 'fullscreen'; message: string; cause: unknown };

/** The browser refused the one-shot PWA install prompt. The browser's own install menu still works. */
export type InstallError = { kind: 'install'; message: string; cause: unknown };

/**
 * Whether the editor can continue by restoring the renderer: the engine paused after a GPU failure, or the selected
 * brush preset could not be re-uploaded after an engine replacement. Restoring sends `recover`, which restarts the
 * renderer and repeats the ready handshake, including the preset upload.
 */
export function isRestorable(error: PaintError): boolean {
  return error.kind === 'gpu' || (error.kind === 'brush' && error.code === 'restore');
}

/** Whether the drawing engine itself stopped, so only a new engine (`PaintEngine.restart`) can continue. */
export function isRestartable(error: PaintError): boolean {
  return error.kind === 'engine' && error.code === 'stopped';
}
