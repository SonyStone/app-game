import type { WebGLRenderingContexts } from './backend/types/contextInformation';

/** The iframe-local canvas constructor patched by a Spector context hook. */
export interface SpectorContextTarget {
  readonly HTMLCanvasElement: typeof HTMLCanvasElement;
}

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

const WEBGL_CONTEXT_TYPES = new Set(['webgl', 'experimental-webgl', 'webgl2', 'experimental-webgl2']);

/**
 * Patches a realm's canvas prototype before application code runs and reports every WebGL context
 * it creates. Repeated `getContext` calls for the same context produce one notification.
 */
export function installSpectorContextHook(options: SpectorContextHookOptions): SpectorContextHook {
  const prototype = options.target.HTMLCanvasElement.prototype;
  const originalGetContext = prototype.getContext;
  const contexts = new Set<WebGLRenderingContexts>();

  const patchedGetContext = function (this: HTMLCanvasElement, ...args: Parameters<HTMLCanvasElement['getContext']>) {
    const context = Reflect.apply(originalGetContext, this, args) as RenderingContext | null;
    if (!WEBGL_CONTEXT_TYPES.has(String(args[0])) || !isWebGLContext(context) || contexts.has(context)) return context;

    contexts.add(context);
    options.onContext(context);
    return context;
  } as HTMLCanvasElement['getContext'];

  prototype.getContext = patchedGetContext;

  return {
    contexts,
    restore() {
      if (prototype.getContext === patchedGetContext) prototype.getContext = originalGetContext;
      contexts.clear();
    }
  };
}

function isWebGLContext(context: RenderingContext | null): context is WebGLRenderingContexts {
  return context !== null && typeof (context as WebGLRenderingContext).getParameter === 'function';
}
