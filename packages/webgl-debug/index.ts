/** A WebGL 1 or WebGL 2 rendering context. */
export type WebGLContext = WebGLRenderingContext | WebGL2RenderingContext;

/** A canvas context name that can produce a WebGL context. */
export type WebGLContextId = 'webgl' | 'experimental-webgl' | 'webgl2' | 'experimental-webgl2';

/** A browser window or test realm containing the canvas constructor to patch. */
export type WebGLContextTarget = Window | { readonly HTMLCanvasElement: typeof HTMLCanvasElement };

/** Details from the first intercepted request for a WebGL context. */
export interface WebGLContextRequest {
  readonly canvas: HTMLCanvasElement;
  readonly contextId: WebGLContextId;
  readonly attributes: WebGLContextAttributes | undefined;
}

/** Configuration for intercepting WebGL context creation in one browser realm. */
export interface WebGLContextHookOptions {
  /** Browser realm whose canvas prototype is patched. Defaults to the current realm. */
  readonly target?: WebGLContextTarget;
  /** Replaces a native context before application code receives it. Runs once per native context. */
  readonly wrapContext?: (context: WebGLContext, request: WebGLContextRequest) => WebGLContext;
  /** Runs once after a native context has been wrapped. */
  readonly onContext?: (context: WebGLContext, request: WebGLContextRequest) => void;
}

/** A reversible canvas context-creation hook. */
export interface WebGLContextHook {
  /** Contexts exposed to application code while this hook is active. */
  readonly contexts: ReadonlySet<WebGLContext>;
  /** Restores the canvas prototype if this hook still owns the patch. */
  restore(): void;
}

/** Common information recorded for every intercepted method call. */
export interface MethodCallDetails {
  readonly target: object;
  readonly name: PropertyKey;
  readonly arguments: readonly unknown[];
  readonly startTime: number;
  readonly endTime: number;
}

/** The result of one intercepted method call. */
export type MethodCall =
  | (MethodCallDetails & { readonly status: 'returned'; readonly result: unknown })
  | (MethodCallDetails & { readonly status: 'threw'; readonly error: unknown });

/** A method plus the receiver that its native implementation requires. */
export interface MethodInvocation {
  readonly target: object;
  readonly name: PropertyKey;
  readonly arguments: readonly unknown[];
  readonly startTime: number;
}

/** Controls how a method wrapper transforms results and reports calls. */
export interface MethodInterceptorOptions {
  /** Reports each return or thrown error after the underlying method finishes. */
  readonly onCall: (call: MethodCall) => void;
  /** Transforms a successful result before the listener and caller receive it. */
  readonly transformResult?: (result: unknown, invocation: MethodInvocation) => unknown;
  /** Supplies timestamps. Defaults to `performance.now()` or `Date.now()`. */
  readonly now?: () => number;
}

/** A callable method supported by the interception helpers. */
export type InterceptedMethod = (this: object, ...arguments_: unknown[]) => unknown;

/**
 * Patches `HTMLCanvasElement.prototype.getContext` in one realm.
 *
 * The hook calls the native method first, filters non-WebGL requests, caches one wrapped value for
 * each native context, and preserves repeated `getContext` identity. Install it before application
 * code creates a context.
 */
export function installWebGLContextHook(options: WebGLContextHookOptions = {}): WebGLContextHook {
  const target = options.target ?? defaultContextTarget();
  const prototype = canvasConstructorFrom(target).prototype;
  const originalGetContext = prototype.getContext;
  const contexts = new Set<WebGLContext>();
  const wrappedByNativeContext = new WeakMap<object, WebGLContext>();
  let restored = false;

  const patchedGetContext = function (this: HTMLCanvasElement, ...arguments_: readonly unknown[]): unknown {
    const result: unknown = Reflect.apply(originalGetContext, this, arguments_);
    const contextId = webGLContextId(arguments_[0]);
    if (!contextId || !isWebGLContext(result)) return result;

    const cached = wrappedByNativeContext.get(result);
    if (cached) return cached;

    const request = {
      canvas: this,
      contextId,
      attributes: isWebGLContextAttributes(arguments_[1]) ? arguments_[1] : undefined
    } satisfies WebGLContextRequest;
    const context = options.wrapContext?.(result, request) ?? result;
    wrappedByNativeContext.set(result, context);
    contexts.add(context);
    options.onContext?.(context, request);
    return context;
  };

  // The runtime implementation preserves the overload selected by the context id.
  prototype.getContext = patchedGetContext as HTMLCanvasElement['getContext'];

  return {
    contexts,
    restore() {
      if (restored) return;
      restored = true;
      if (prototype.getContext === patchedGetContext) prototype.getContext = originalGetContext;
      contexts.clear();
    }
  };
}

/**
 * Wraps one method while preserving its receiver, return value, and thrown errors.
 *
 * This is the shared interception mechanism used by both proxy-based and in-place WebGL debuggers.
 */
export function createMethodInterceptor(
  target: object,
  name: PropertyKey,
  method: InterceptedMethod,
  options: MethodInterceptorOptions
): InterceptedMethod {
  const now = options.now ?? defaultNow;

  return function (...arguments_: unknown[]): unknown {
    const startTime = now();
    const invocation = { target, name, arguments: arguments_, startTime } satisfies MethodInvocation;
    let result: unknown;

    try {
      const nativeResult = Reflect.apply(method, target, arguments_);
      result = options.transformResult ? options.transformResult(nativeResult, invocation) : nativeResult;
    } catch (error: unknown) {
      options.onCall({ ...invocation, status: 'threw', error, endTime: now() });
      throw error;
    }

    options.onCall({ ...invocation, status: 'returned', result, endTime: now() });
    return result;
  };
}

/** Controls which methods a proxy intercepts and how it reports them. */
export interface MethodProxyOptions extends MethodInterceptorOptions {
  /** Chooses methods to intercept. All callable properties are intercepted by default. */
  readonly shouldIntercept?: (name: PropertyKey, method: InterceptedMethod) => boolean;
}

/**
 * Returns a stable proxy that intercepts callable properties and binds them to the native target.
 * Property reads, writes, method return values, and exceptions otherwise match the target object.
 */
export function createMethodProxy<TTarget extends object>(target: TTarget, options: MethodProxyOptions): TTarget {
  const methods = new Map<PropertyKey, InterceptedMethod>();

  return new Proxy(target, {
    get(nativeTarget, property) {
      const value: unknown = Reflect.get(nativeTarget, property, nativeTarget);
      if (typeof value !== 'function') return value;

      // DOM methods have narrower overloaded declarations than this generic interception seam.
      const method = value as InterceptedMethod;
      if (options.shouldIntercept && !options.shouldIntercept(property, method)) {
        return method.bind(nativeTarget);
      }

      const cached = methods.get(property);
      if (cached) return cached;
      const intercepted = createMethodInterceptor(nativeTarget, property, method, options);
      methods.set(property, intercepted);
      return intercepted;
    },
    set(nativeTarget, property, value) {
      return Reflect.set(nativeTarget, property, value, nativeTarget);
    }
  });
}

/** Returns whether an unknown value is a WebGL rendering context from any browser realm. */
export function isWebGLContext(value: unknown): value is WebGLContext {
  return typeof value === 'object' && value !== null && typeof Reflect.get(value, 'getParameter') === 'function';
}

function defaultContextTarget(): WebGLContextTarget {
  if (typeof HTMLCanvasElement === 'undefined') {
    throw new Error('No HTMLCanvasElement is available. Pass the browser realm as `target`.');
  }
  return { HTMLCanvasElement };
}

function canvasConstructorFrom(target: WebGLContextTarget): typeof HTMLCanvasElement {
  const constructor: unknown = Reflect.get(target, 'HTMLCanvasElement');
  if (typeof constructor !== 'function' || !('prototype' in constructor)) {
    throw new Error('The WebGL context target does not expose HTMLCanvasElement.');
  }
  return constructor as typeof HTMLCanvasElement;
}

function webGLContextId(value: unknown): WebGLContextId | undefined {
  if (value === 'webgl' || value === 'experimental-webgl' || value === 'webgl2' || value === 'experimental-webgl2') {
    return value;
  }
  return undefined;
}

function isWebGLContextAttributes(value: unknown): value is WebGLContextAttributes {
  return typeof value === 'object' && value !== null;
}

function defaultNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}
