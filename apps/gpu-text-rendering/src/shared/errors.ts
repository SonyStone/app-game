import type { AbortedError, GpuError } from '@app-game/solid-gpu/errors';

/**
 * Expected viewer failures: document failures plus the shared GPU and cancellation errors from
 * `@app-game/solid-gpu/errors`. Callers can branch on kind/code without parsing human-readable messages.
 */
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

/** Preserves the original cause for diagnostics while exposing a stable document error code. */
export function documentError(code: DocumentError['code'], message: string, cause?: unknown): DocumentError {
  return { kind: 'document', code, message, cause };
}

/** A rejected fullscreen request does not invalidate the document renderer. */
export type FullscreenError = { kind: 'fullscreen'; message: string; cause: unknown };
