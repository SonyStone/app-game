import { err, ok, type Result } from 'neverthrow';

/** Expected viewer failures. Callers can branch on kind/code without parsing human-readable messages. */
export type ViewerError = DocumentError | GpuError | AbortedError;

/** Asset transport, decoding and structural validation failures. */
export type DocumentError = {
  kind: 'document';
  code:
    | 'load'
    | 'http'
    | 'decode'
    | 'invalid-data'
    | 'unsupported-format'
    | 'document-limit'
    | 'checksum'
    | 'unsupported-pdf';
  message: string;
  cause?: unknown;
};

/** GPU capability, initialization and runtime failures. */
export type GpuError = {
  kind: 'gpu';
  code:
    | 'unavailable'
    | 'adapter'
    | 'buffer-limit'
    | 'texture-limit'
    | 'device'
    | 'canvas'
    | 'validation'
    | 'lost'
    | 'render'
    | 'destroyed';
  message: string;
  cause?: unknown;
};

/** A rejected fullscreen request does not invalidate the document renderer. */
export type FullscreenError = { kind: 'fullscreen'; message: string; cause: unknown };

/** Cancellation is an expected outcome, separate from an operation failure. */
export type AbortedError = { kind: 'aborted'; message: string };

/** Preserves the original cause for diagnostics while exposing a stable document error code. */
export function documentError(code: DocumentError['code'], message: string, cause?: unknown): DocumentError {
  return { kind: 'document', code, message, cause };
}

/** Preserves the original cause for diagnostics while exposing a stable GPU error code. */
export function gpuError(code: GpuError['code'], message: string, cause?: unknown): GpuError {
  return { kind: 'gpu', code, message, cause };
}

/** Checks cancellation without throwing the signal's untyped reason. */
export function checkAborted(signal?: AbortSignal): Result<void, AbortedError> {
  return signal?.aborted ? err({ kind: 'aborted', message: 'Operation cancelled' }) : ok();
}

/**
 * Converts an external exception into a displayable message; callers retain its cause separately.
 * Uses a string `message` property from Error instances and plain error objects, otherwise `String(cause)`.
 */
export function errorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }

  if (typeof cause === 'object' && cause !== null && 'message' in cause && typeof cause.message === 'string') {
    return cause.message;
  }

  return String(cause);
}

/** Extracts successful values when a public type is derived from a result-returning function. */
export type ResultValue<R> = R extends Result<infer T, unknown> ? T : never;
