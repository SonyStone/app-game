import { err, ok, type Result } from 'neverthrow';

/**
 * The page's end of the Android shell's bridge (`apps/paint-android`, `ShellBridge.kt`), or `undefined` outside the
 * shell. One client per page: the shell injects its port into the document before any script runs, so presence is
 * known synchronously and never changes.
 *
 * Wire format, one JSON string per message in both directions: `{kind:'request', id, method, params}`,
 * `{kind:'response', id, result}` or `{kind:'response', id, error: {code, message}}`, and, from the shell only,
 * `{kind:'event', name, data}`. Each side numbers its own requests.
 *
 * Adding a native function: register it in the shell (`bridge.command` in `MainActivity.kt`), describe it in
 * {@link ShellMethods}, and call `request(name, params)`; check `info().capabilities` first where older shells may
 * lack it.
 */
export function nativeShell(): NativeShellClient | undefined {
  if (client === undefined) {
    const port = (globalThis as { paintShell?: ShellPort }).paintShell;
    client = port && typeof port.postMessage === 'function' ? createShellClient(port) : null;
  }

  return client ?? undefined;
}

/** `null` once looked up and absent. */
let client: NativeShellClient | null | undefined;

/** The object the shell injects as `globalThis.paintShell` (an Android `WebMessageListener` port). */
export type ShellPort = {
  postMessage(message: string): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
};

/** What the shell can do: method name → its params and result. */
export type ShellMethods = {
  /** The shell's version and capabilities; also opens the channel, as the shell can only answer a page that sent. */
  info: { params: Record<string, never>; result: ShellInfo };
  /**
   * Names the parts of the side edges where Android's back gesture must not start, most important first, in CSS
   * pixels; `{}` goes back to the shell's default, a band that follows the hovering pen. Android honors at most
   * `limit` (200 dp) per edge, so the result gives the ranges as applied.
   */
  setGestureExclusion: {
    params: { left?: VerticalRange[]; right?: VerticalRange[] };
    result: { left: VerticalRange[]; right: VerticalRange[]; limit: number };
  };
};

/** A vertical stretch of a screen edge, in CSS pixels from the top; `bottom` is exclusive. */
export type VerticalRange = { top: number; bottom: number };

/** The shell's answer to `info`. */
export type ShellInfo = {
  shell: 'paint-android';
  version: string;
  build: number;
  /** The methods of {@link ShellMethods} this shell has. */
  capabilities: string[];
  /** The events of {@link ShellEvents} this shell sends. */
  events: string[];
  /** The Android System WebView version. */
  webView?: string;
  /** The Android API level. */
  android: number;
  device: string;
};

/** What the shell sends unasked: event name → its data. */
export type ShellEvents = {
  /** Pen hover as Android delivers it to the shell's window; see `createNativeHover`. */
  hover: NativeHover;
};

/**
 * One pen hover sample from the shell. Android ends hover right before the pen touches down; the shell drops that
 * exit, so `exit` means the pen left its hover range or the window.
 */
export type NativeHover = {
  phase: 'enter' | 'move' | 'exit';
  /** CSS pixels from the WebView's top-left corner. */
  x: number;
  y: number;
  /** Radians from the screen's normal (Android's `AXIS_TILT`). */
  tilt: number;
  /** Radians, the direction the pen leans to: 0 up, -π/2 right, π/2 left (Android's `AXIS_ORIENTATION`). */
  orientation: number;
  /** The pen's distance from the screen in Android's units, 0 when unknown. */
  distance: number;
  /** The pen's eraser end hovers. */
  eraser: boolean;
  /** Android's button state, such as the pen's barrel buttons. */
  buttons: number;
  /** When Android took the sample, in milliseconds of the shell's uptime clock. */
  time: number;
  /** When the shell sent it, on the same clock. */
  sentAt: number;
};

/** What the page answers to the shell: method name → its params and result. */
export type PageMethods = {
  /** The back button or gesture; `handled` when the page closed something, else the shell offers to exit. */
  back: { params: Record<string, never>; result: { handled: boolean } };
};

/** A failed shell call: `code` is the shell's (`unknown-method`, `failed`) or `invalid-response`. */
export class NativeShellError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'NativeShellError';
  }
}

export type NativeShellClient = ReturnType<typeof createShellClient>;

/** The client over `port`; see {@link nativeShell}, which every page caller should use. Exported for tests. */
export function createShellClient(port: ShellPort) {
  let nextId = 1;
  const calls = new Map<number, (message: { result?: unknown; error?: { code?: string; message?: string } }) => void>();
  const listeners = new Map<string, Set<(data: never) => void>>();
  const handlers = new Map<string, (params: never) => unknown>();

  port.addEventListener('message', (event) => {
    const message = parse(event.data);
    if (!message) {
      return;
    }

    if (message.kind === 'response') {
      const call = calls.get(message.id);
      calls.delete(message.id);
      call?.(message);
    } else if (message.kind === 'event') {
      listeners.get(message.name)?.forEach((listener) => listener(message.data as never));
    } else if (message.kind === 'request') {
      void answer(message.id, message.method, message.params);
    }
  });

  return {
    /** Calls a shell method; resolves with its result, or the shell's error. */
    request<M extends keyof ShellMethods>(
      method: M,
      params: ShellMethods[M]['params']
    ): Promise<Result<ShellMethods[M]['result'], NativeShellError>> {
      const id = nextId++;
      return new Promise((resolve) => {
        calls.set(id, (message) => {
          if (message.error) {
            resolve(err(new NativeShellError(message.error.code ?? 'failed', message.error.message ?? method)));
          } else if (message.result && typeof message.result === 'object') {
            resolve(ok(message.result as ShellMethods[M]['result']));
          } else {
            resolve(err(new NativeShellError('invalid-response', `${method} answered without a result`)));
          }
        });
        port.postMessage(JSON.stringify({ kind: 'request', id, method, params }));
      });
    },
    /** Listens to a shell event until the returned function is called. */
    on<E extends keyof ShellEvents>(name: E, listener: (data: ShellEvents[E]) => void) {
      const set = listeners.get(name) ?? new Set();
      listeners.set(name, set);
      set.add(listener as (data: never) => void);
      return () => set.delete(listener as (data: never) => void);
    },
    /**
     * Answers the shell's requests for `method` with `handler` until the returned function is called; a later handler
     * replaces an earlier one. A request without a handler, or whose handler throws, gets an error.
     */
    handle<M extends keyof PageMethods>(
      method: M,
      handler: (params: PageMethods[M]['params']) => PageMethods[M]['result'] | Promise<PageMethods[M]['result']>
    ) {
      handlers.set(method, handler as (params: never) => unknown);
      return () => {
        if (handlers.get(method) === handler) {
          handlers.delete(method);
        }
      };
    }
  };

  async function answer(id: number, method: string, params: unknown) {
    const handler = handlers.get(method);
    try {
      if (!handler) {
        throw new NativeShellError('unknown-method', `The page has no method ${method}`);
      }

      const result = await handler(params as never);
      port.postMessage(JSON.stringify({ kind: 'response', id, result }));
    } catch (error) {
      const code = error instanceof NativeShellError ? error.code : 'failed';
      port.postMessage(JSON.stringify({ kind: 'response', id, error: { code, message: String(error) } }));
    }
  }
}

type Message =
  | { kind: 'request'; id: number; method: string; params: unknown }
  | { kind: 'response'; id: number; result?: unknown; error?: { code?: string; message?: string } }
  | { kind: 'event'; name: string; data: unknown };

function parse(data: unknown): Message | undefined {
  try {
    const message = JSON.parse(String(data)) as Partial<Message> | null;
    return message && typeof message.kind === 'string' ? (message as Message) : undefined;
  } catch {
    return undefined;
  }
}
