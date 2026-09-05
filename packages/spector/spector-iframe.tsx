import type { JSX } from '@solidjs/web';
import { For, Show, createEffect, createMemo, createSignal, onCleanup, untrack } from 'solid-js';
import { SpectorResultView } from './solid/spector-result-view';
import { createSpectorSession, type SpectorCaptureOptions, type SpectorSession } from './solid/spector-session';
import { Spector } from './spector';
import { installSpectorContextHook, type SpectorContextHook } from './spector-context-hook';

/** Same-origin document source loaded after Spector patches the iframe realm. */
export type SpectorIframeSource =
  | { readonly src: string; readonly srcdoc?: never }
  | { readonly src?: never; readonly srcdoc: string };

/** The iframe realm passed to an optional application initializer. */
export interface SpectorIframeApplicationContext {
  readonly window: Window;
  readonly document: Document;
}

/** Starts an iframe application after Spector interception is active. */
export type SpectorIframeInitializer = (
  context: SpectorIframeApplicationContext
) => void | (() => void) | Promise<void | (() => void)>;

/** Configuration for a page and Spector frame-capture split view. */
export type SpectorIframeProps = SpectorIframeSource & {
  /** Accessible iframe name and heading. Defaults to "Inspected WebGL page". */
  readonly iframeTitle?: string;
  /** Runs after the trusted document is written and can return application teardown. */
  readonly initialize?: SpectorIframeInitializer;
  /** Captures the first context's first rendered frame. Defaults to true. */
  readonly autoCapture?: boolean;
  /** Maximum commands captured after pressing capture. Zero captures one frame. Defaults to zero. */
  readonly commandCount?: number;
  /** Skips expensive visual state while capturing. Defaults to false. */
  readonly quickCapture?: boolean;
  /** Includes full transient state while capturing. Defaults to false. */
  readonly fullCapture?: boolean;
  /** Optional controls rendered beside the iframe reload button. */
  readonly pageControls?: JSX.Element;
};

/**
 * Loads a trusted same-origin page after patching its canvas prototype, then shows the page and
 * Spector capture viewer side by side. Cross-origin `src` pages cannot be inspected.
 */
export function SpectorIframe(props: SpectorIframeProps): JSX.Element {
  const [loadState, setLoadState] = createSignal<FrameState>({ status: 'loading' });
  const [session, setSession] = createSignal<SpectorSession>();
  const [selectedContext, setSelectedContext] = createSignal(0);
  const [resultsVisible, setResultsVisible] = createSignal(true);
  const contexts = () => session()?.contexts() ?? [];
  const activeContext = createMemo(() => contexts()[selectedContext()] ?? contexts()[0]);
  let iframe!: HTMLIFrameElement;
  let hook: SpectorContextHook | undefined;
  let applicationCleanup: (() => void) | undefined;
  let loadGeneration = 0;
  let autoCaptureStarted = false;
  let activeCaptureOptions: SpectorCaptureOptions = {};

  createEffect(currentLoadRequest, (request) => {
    untrack(() => void loadFrame(request));
  });
  onCleanup(disposeFrame);

  function currentLoadRequest(): FrameLoadRequest {
    return {
      source: props.srcdoc !== undefined ? { srcdoc: props.srcdoc } : { src: props.src },
      initialize: props.initialize,
      autoCapture: props.autoCapture ?? true,
      captureOptions: {
        commandCount: props.commandCount,
        quickCapture: props.quickCapture,
        fullCapture: props.fullCapture
      }
    };
  }

  async function loadFrame(request: FrameLoadRequest): Promise<void> {
    disposeFrame();
    const generation = ++loadGeneration;
    autoCaptureStarted = false;
    activeCaptureOptions = request.captureOptions;
    setSelectedContext(0);
    setLoadState({ status: 'loading' });

    try {
      const resolvedSource = await resolveFrameSource(request.source);
      if (generation !== loadGeneration) return;
      const frameWindow = iframe.contentWindow;
      const frameDocument = iframe.contentDocument;
      if (!frameWindow || !frameDocument) throw new Error('The iframe did not expose a same-origin document.');

      const currentSession = createSpectorSession(new Spector({ target: frameWindow }));
      setSession(currentSession);

      const canvas = frameDocument.createElement('canvas');
      hook = installSpectorContextHook({
        target: { HTMLCanvasElement: canvas.constructor as typeof HTMLCanvasElement },
        onContext(context) {
          if (generation !== loadGeneration) return;
          const availableContext = currentSession.registerContext(context);
          setLoadState({ status: 'ready' });
          if (request.autoCapture && !autoCaptureStarted) {
            autoCaptureStarted = true;
            queueMicrotask(() => {
              if (generation === loadGeneration && session() === currentSession) {
                capture(availableContext, request.captureOptions);
              }
            });
          }
        }
      });

      frameDocument.open();
      frameDocument.write(resolvedSource.html);
      frameDocument.close();
      setLoadState(hook.contexts.size > 0 ? { status: 'ready' } : { status: 'waiting' });

      const cleanup = await request.initialize?.({ document: frameDocument, window: frameWindow });
      if (generation !== loadGeneration) {
        if (typeof cleanup === 'function') cleanup();
        return;
      }
      applicationCleanup = typeof cleanup === 'function' ? cleanup : undefined;
    } catch (error: unknown) {
      if (generation !== loadGeneration) return;
      setLoadState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  function capture(context = activeContext(), options = activeCaptureOptions): void {
    setResultsVisible(true);
    session()?.captureContext(context, options);
  }

  function disposeFrame(): void {
    loadGeneration += 1;
    applicationCleanup?.();
    applicationCleanup = undefined;
    hook?.restore();
    hook = undefined;
    session()?.dispose();
    setSession(undefined);
  }

  const iframeTitle = () => props.iframeTitle ?? 'Inspected WebGL page';
  const captureLabel = () => {
    const state = session()?.status();
    if (state?.type === 'capturing') return 'Capturing next frame...';
    if (state?.type === 'captured') return `${state.commandCount} commands captured`;
    if (state?.type === 'error') return state.message;
    return 'Ready to capture the next rendered frame.';
  };

  return (
    <main class="grid h-screen w-full grid-cols-2 overflow-hidden bg-[#222] text-white max-[850px]:h-auto max-[850px]:min-h-screen max-[850px]:grid-cols-1 max-[850px]:grid-rows-[minmax(360px,50vh)_minmax(420px,50vh)] max-[850px]:overflow-visible">
      <section
        class="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] border-r-2 border-[#090909] bg-white max-[850px]:border-r-0 max-[850px]:border-b-2"
        aria-label={iframeTitle()}
      >
        <header class={toolbarClass()}>
          <div class="grid min-w-0 gap-0.5">
            <span class="font-['Consolas',monospace] text-[9px] leading-none font-bold tracking-[0.12em] text-[#f0640d] uppercase">
              inspected page
            </span>
            <strong class="truncate text-[13px]">{iframeTitle()}</strong>
          </div>
          <div class="flex min-w-0 items-center gap-2 max-[850px]:flex-wrap">
            {props.pageControls}
            <button class={toolbarButtonClass()} type="button" onClick={() => void loadFrame(currentLoadRequest())}>
              Reload page
            </button>
          </div>
        </header>
        <iframe
          class="h-full w-full border-0 bg-white"
          ref={iframe}
          title={iframeTitle()}
          sandbox="allow-same-origin allow-scripts"
        />
      </section>

      <section class="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)]" aria-label="Spector frame inspector">
        <header class={toolbarClass()}>
          <div class="grid min-w-0 gap-0.5">
            <span class="font-['Consolas',monospace] text-[9px] leading-none font-bold tracking-[0.12em] text-[#f0640d] uppercase">
              Spector
            </span>
            <strong class="truncate text-[13px]">{captureLabel()}</strong>
          </div>
          <div class="flex min-w-0 items-center gap-2 max-[850px]:flex-wrap">
            <Show when={contexts().length > 1}>
              <label class="flex items-center gap-1.5 font-['Consolas',monospace] text-[10px] leading-none font-bold text-[#ddd] uppercase">
                <span>Context</span>
                <select
                  class={toolbarControlClass()}
                  value={selectedContext()}
                  onChange={(event) => setSelectedContext(event.currentTarget.selectedIndex)}
                >
                  <For each={contexts()}>
                    {(context, index) => (
                      <option>
                        WebGL context {index() + 1}, {context.canvas.width}x{context.canvas.height}
                      </option>
                    )}
                  </For>
                </select>
              </label>
            </Show>
            <button
              class={toolbarButtonClass()}
              type="button"
              disabled={!activeContext() || session()?.status().type === 'capturing'}
              onClick={() => capture()}
            >
              Capture next frame
            </button>
          </div>
        </header>
        <div class="relative min-h-0 min-w-0 overflow-hidden bg-[#222]">
          <Show
            when={session() && (session()?.captures().length ?? 0) > 0 && resultsVisible()}
            fallback={<FrameStatus state={loadState()} autoCapture={props.autoCapture ?? true} />}
          >
            <SpectorResultView
              captures={session()?.captures() ?? []}
              onAddCapture={(capture) => session()?.addCapture(capture)}
              onCompileProgram={(source) => session()?.rebuildProgram(source) ?? Promise.resolve()}
              onClose={() => setResultsVisible(false)}
            />
          </Show>
        </div>
      </section>
    </main>
  );
}

type FrameState =
  | { readonly status: 'loading' }
  | { readonly status: 'waiting' }
  | { readonly status: 'ready' }
  | { readonly status: 'error'; readonly message: string };

interface FrameLoadRequest {
  readonly source: SpectorIframeSource;
  readonly initialize: SpectorIframeInitializer | undefined;
  readonly autoCapture: boolean;
  readonly captureOptions: SpectorCaptureOptions;
}

function FrameStatus(props: { readonly state: FrameState; readonly autoCapture: boolean }): JSX.Element {
  return (
    <div
      class={`grid h-full min-h-40 place-items-center p-8 text-center font-['Arial','Helvetica',sans-serif] text-[14px] leading-[1.5] font-bold ${
        props.state.status === 'error' ? 'bg-[#451d22] text-[#ffd7d7]' : 'text-[#ddd]'
      }`}
    >
      <Show when={props.state.status === 'loading'}>Loading the inspected page...</Show>
      <Show when={props.state.status === 'waiting'}>Waiting for the page to create a WebGL context.</Show>
      <Show when={props.state.status === 'ready'}>
        {props.autoCapture
          ? 'The first rendered frame will be captured automatically.'
          : 'Choose Capture next frame to inspect the current context.'}
      </Show>
      <Show when={props.state.status === 'error'}>{props.state.status === 'error' ? props.state.message : ''}</Show>
    </div>
  );
}

function toolbarClass(): string {
  return "relative z-[100000] flex min-h-[52px] items-center justify-between gap-4 border-b border-[#111] bg-[#2c2c2c] py-[7px] pr-[10px] pl-[13px] font-['Arial','Helvetica',sans-serif] shadow-[0_2px_7px_#0008] max-[850px]:flex-wrap";
}

function toolbarControlClass(): string {
  return "min-h-[30px] min-w-0 rounded-[2px] border border-[#f0640d] bg-[#222] px-[9px] font-['Arial','Helvetica',sans-serif] text-[11px] leading-none font-bold normal-case text-white outline-none";
}

function toolbarButtonClass(): string {
  return `${toolbarControlClass()} cursor-pointer hover:bg-[#4a2714] disabled:cursor-not-allowed disabled:opacity-50`;
}

interface ResolvedFrameSource {
  readonly html: string;
}

async function resolveFrameSource(source: SpectorIframeSource): Promise<ResolvedFrameSource> {
  if (source.srcdoc !== undefined) return { html: source.srcdoc };

  const url = new URL(source.src, window.location.href);
  if (url.origin !== window.location.origin) {
    throw new Error(`Cannot inspect cross-origin page ${url.origin}. Serve it from ${window.location.origin}.`);
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url.pathname}: HTTP ${response.status}.`);
  return { html: addBaseUrl(await response.text(), url.href) };
}

function addBaseUrl(html: string, url: string): string {
  const base = `<base href="${escapeHtmlAttribute(url)}">`;
  return /<head(?:\s[^>]*)?>/i.test(html)
    ? html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${base}`)
    : base + html;
}

function escapeHtmlAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}
