import { installWebGLContextHook, type WebGLContextTarget } from '@app-game/webgl-debug';
import type { WebGLRenderingContexts } from './backend/types/contextInformation';

/** The iframe-local canvas constructor patched by a Spector context hook. */
export type SpectorContextTarget = WebGLContextTarget;

/** Configuration for intercepting WebGL context creation in one browser realm. */
export interface SpectorContextHookOptions {
  readonly target: SpectorContextTarget;
  /** Runs once for each WebGL context returned by the patched canvas prototype. */
  readonly onContext: (context: WebGLRenderingContexts) => void;
}

/** A reversible WebGL context-creation hook installed in one browser realm. */
export interface SpectorContextHook {
  readonly contexts: ReadonlySet<WebGLRenderingContexts>;
  /** Restores the canvas prototype when this hook still owns the patch. */
  restore(): void;
}

/**
 * Patches a realm's canvas prototype before application code runs and reports every WebGL context
 * it creates. Repeated `getContext` calls for the same context produce one notification.
 */
export function installSpectorContextHook(options: SpectorContextHookOptions): SpectorContextHook {
  return installWebGLContextHook({
    target: options.target,
    onContext: options.onContext
  });
}
