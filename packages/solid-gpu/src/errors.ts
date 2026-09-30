import { err, ok, type Result } from 'neverthrow';

/**
 * GPU capability, initialization and runtime failures. Callers branch on `code` without parsing `message`;
 * `cause` preserves the original exception, event or lost-device info for diagnostics.
 */
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

/** Preserves the original cause for diagnostics while exposing a stable GPU error code. */
export function gpuError(code: GpuError['code'], message: string, cause?: unknown): GpuError {
  return { kind: 'gpu', code, message, cause };
}

/** Cancellation is an expected outcome, separate from an operation failure. */
export type AbortedError = { kind: 'aborted'; message: string };

/** The shared cancellation outcome; cancelled operations resolve it rather than rejecting. */
export function abortedError(): AbortedError {
  return { kind: 'aborted', message: 'Operation cancelled' };
}

/** Checks cancellation without throwing the signal's untyped reason. An omitted signal is never aborted. */
export function checkAborted(signal?: AbortSignal): Result<void, AbortedError> {
  return signal?.aborted ? err(abortedError()) : ok();
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
