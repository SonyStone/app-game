import type { JSX } from '@solidjs/web';
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { Spector, type IAvailableContext } from './spector';
import { installSpectorContextHook, type SpectorContextHook } from './spector-context-hook';
import './spector-iframe.css';

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
  const [captureState, setCaptureState] = createSignal<CaptureState>({ status: 'idle' });
  const [contexts, setContexts] = createSignal<readonly IAvailableContext[]>([]);
  const [selectedContext, setSelectedContext] = createSignal(0);
  const activeContext = createMemo(() => contexts()[selectedContext()] ?? contexts()[0]);
  let iframe!: HTMLIFrameElement;
  let resultRoot!: HTMLDivElement;
  let hook: SpectorContextHook | undefined;
  let spector: Spector | undefined;
  let applicationCleanup: (() => void) | undefined;
  let loadGeneration = 0;
  let autoCaptureStarted = false;

  createEffect(currentSource, (source) => {
    void loadFrame(source);
  });
  onCleanup(disposeFrame);

  function currentSource(): SpectorIframeSource {
    return props.srcdoc !== undefined ? { srcdoc: props.srcdoc } : { src: props.src };
  }

  async function loadFrame(source: SpectorIframeSource): Promise<void> {
    disposeFrame();
    const generation = ++loadGeneration;
    autoCaptureStarted = false;
    setContexts([]);
    setSelectedContext(0);
    setLoadState({ status: 'loading' });
    setCaptureState({ status: 'idle' });

    try {
      const resolvedSource = await resolveFrameSource(source);
      if (generation !== loadGeneration) return;
      const frameWindow = iframe.contentWindow;
      const frameDocument = iframe.contentDocument;
      if (!frameWindow || !frameDocument) throw new Error('The iframe did not expose a same-origin document.');

      const currentSpector = new Spector({ target: frameWindow, resultRoot });
      spector = currentSpector;
      const resultView = currentSpector.getResultUI();
      currentSpector.onCaptureStarted.add(() => setCaptureState({ status: 'capturing' }));
      currentSpector.onCapture.add((capture) => {
        resultView.display();
        resultView.addCapture(capture);
        setCaptureState({ status: 'captured', commandCount: capture.commands.length });
      });
      currentSpector.onError.add((message) => setCaptureState({ status: 'error', message }));

      const canvas = frameDocument.createElement('canvas');
      hook = installSpectorContextHook({
        target: { HTMLCanvasElement: canvas.constructor as typeof HTMLCanvasElement },
        onContext(context) {
          if (generation !== loadGeneration) return;
          const availableContext = currentSpector.spyContext(context);
          const availableContexts = currentSpector.getAvailableContexts();
          setContexts(availableContexts);
          setLoadState({ status: 'ready' });
          if ((props.autoCapture ?? true) && !autoCaptureStarted) {
            autoCaptureStarted = true;
            queueMicrotask(() => {
              if (generation === loadGeneration && spector === currentSpector) capture(availableContext);
            });
          }
        }
      });

      frameDocument.open();
      frameDocument.write(resolvedSource.html);
      frameDocument.close();
      setLoadState(hook.contexts.size > 0 ? { status: 'ready' } : { status: 'waiting' });

      const cleanup = await props.initialize?.({ document: frameDocument, window: frameWindow });
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

  function capture(context = activeContext()): void {
    if (!context || !spector || captureState().status === 'capturing') return;
    setCaptureState({ status: 'capturing' });
    spector.captureContextSpy(
      context.contextSpy,
      props.commandCount ?? 0,
      props.quickCapture ?? false,
      props.fullCapture ?? false
    );
  }

  function disposeFrame(): void {
    loadGeneration += 1;
    applicationCleanup?.();
    applicationCleanup = undefined;
    hook?.restore();
    hook = undefined;
    spector?.dispose();
    spector = undefined;
    resultRoot?.replaceChildren();
  }

  const iframeTitle = () => props.iframeTitle ?? 'Inspected WebGL page';
  const captureLabel = () => {
    const state = captureState();
    if (state.status === 'capturing') return 'Capturing next frame...';
    if (state.status === 'captured') return `${state.commandCount} commands captured`;
    if (state.status === 'error') return state.message;
    return 'Ready to capture the next rendered frame.';
  };

  return (
    <main class="spector-split-view">
      <section class="spector-split-view__page" aria-label={iframeTitle()}>
        <header class="spector-split-view__bar">
          <div>
            <span>inspected page</span>
            <strong>{iframeTitle()}</strong>
          </div>
          <div class="spector-split-view__actions">
            {props.pageControls}
            <button type="button" onClick={() => void loadFrame(currentSource())}>
              Reload page
            </button>
          </div>
        </header>
        <iframe ref={iframe} title={iframeTitle()} sandbox="allow-same-origin allow-scripts" />
      </section>

      <section class="spector-split-view__inspector" aria-label="Spector frame inspector">
        <header class="spector-split-view__bar">
          <div>
            <span>Spector</span>
            <strong>{captureLabel()}</strong>
          </div>
          <div class="spector-split-view__actions">
            <Show when={contexts().length > 1}>
              <label>
                Context
                <select
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
              type="button"
              disabled={!activeContext() || captureState().status === 'capturing'}
              onClick={() => capture()}
            >
              Capture next frame
            </button>
          </div>
        </header>
        <div class="spector-split-view__result">
          <FrameStatus state={loadState()} autoCapture={props.autoCapture ?? true} />
          <div ref={resultRoot} class="spector-split-view__result-root" tabindex="0" />
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

type CaptureState =
  | { readonly status: 'idle' }
  | { readonly status: 'capturing' }
  | { readonly status: 'captured'; readonly commandCount: number }
  | { readonly status: 'error'; readonly message: string };

function FrameStatus(props: { readonly state: FrameState; readonly autoCapture: boolean }): JSX.Element {
  return (
    <div class={`spector-frame-status is-${props.state.status}`}>
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
