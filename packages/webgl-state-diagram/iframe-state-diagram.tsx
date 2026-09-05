import { Button } from '@app-game/components/ui/button';
import type { JSX } from '@solidjs/web';
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import {
  installWebGLContextHook,
  type WebGLContextHook,
  type WebGLInspector,
  type WebGLInspectorOptions
} from './gl-debug-wrapper';
import { WebGLStateDiagram } from './state-diagram';
import './webgl-state-diagram.css';

/** Same-origin document source loaded after the iframe's WebGL hook is installed. */
export type WebGLIframeSource =
  | { readonly src: string; readonly srcdoc?: never }
  | { readonly src?: never; readonly srcdoc: string };

/** The iframe realm passed to an optional application initializer. */
export interface WebGLIframeApplicationContext {
  readonly window: Window;
  readonly document: Document;
}

/** Starts an iframe application after interception is active and optionally returns its teardown. */
export type WebGLIframeInitializer = (
  context: WebGLIframeApplicationContext
) => void | (() => void) | Promise<void | (() => void)>;

/** Configuration for a split iframe and live WebGL state inspector. */
export type WebGLIframeStateDiagramProps = WebGLIframeSource & {
  /** Accessible iframe name and heading for the page pane. */
  readonly iframeTitle?: string;
  /** Diagram title. Defaults to the iframe title plus "WebGL state". */
  readonly diagramTitle?: string;
  /** Runs after the trusted document is written and while the iframe hook is active. */
  readonly initialize?: WebGLIframeInitializer;
  /** Limits applied to every WebGL context created by the iframe. */
  readonly inspectorOptions?: WebGLInspectorOptions;
  /** Opens the diagram reading guide on first render. Defaults to false in split view. */
  readonly initialHelpOpen?: boolean;
  /** Optional controls rendered beside the iframe reload button. */
  readonly pageControls?: JSX.Element;
};

/**
 * Loads a trusted same-origin page after patching its canvas prototype, then shows the page and its
 * live WebGL state side by side. Cross-origin pages cannot be inspected through this component.
 */
export function WebGLIframeStateDiagram(props: WebGLIframeStateDiagramProps): JSX.Element {
  const [loadState, setLoadState] = createSignal<IframeLoadState>({ status: 'loading' });
  const [inspectors, setInspectors] = createSignal<readonly WebGLInspector[]>([]);
  const [selectedInspector, setSelectedInspector] = createSignal(0);
  const activeInspector = createMemo(() => inspectors()[selectedInspector()] ?? inspectors()[0]);
  let iframe!: HTMLIFrameElement;
  let hook: WebGLContextHook | undefined;
  let applicationCleanup: (() => void) | undefined;
  let loadGeneration = 0;

  createEffect(currentSource, (source) => {
    void loadFrame(source);
  });
  onCleanup(disposeFrame);

  function currentSource(): WebGLIframeSource {
    return props.srcdoc !== undefined ? { srcdoc: props.srcdoc } : { src: props.src };
  }

  async function loadFrame(source: WebGLIframeSource): Promise<void> {
    disposeFrame();
    const generation = ++loadGeneration;
    setInspectors([]);
    setSelectedInspector(0);
    setLoadState({ status: 'loading' });

    try {
      const resolvedSource = await resolveFrameSource(source);
      if (generation !== loadGeneration) return;
      const frameWindow = iframe.contentWindow;
      const frameDocument = iframe.contentDocument;
      if (!frameWindow || !frameDocument) throw new Error('The iframe did not expose a same-origin document.');

      hook = installWebGLContextHook({
        ...props.inspectorOptions,
        target: frameWindow,
        onContext(inspector) {
          setInspectors((current) => (current.includes(inspector) ? current : [...current, inspector]));
          setLoadState({ status: 'ready' });
        }
      });

      frameDocument.open();
      frameDocument.write(resolvedSource.html);
      frameDocument.close();
      setLoadState(hook.inspectors.size > 0 ? { status: 'ready' } : { status: 'waiting' });

      const cleanup = await props.initialize?.({ document: frameDocument, window: frameWindow });
      if (generation !== loadGeneration) {
        if (typeof cleanup === 'function') cleanup();
        return;
      }
      applicationCleanup = typeof cleanup === 'function' ? cleanup : undefined;
    } catch (error: unknown) {
      if (generation !== loadGeneration) return;
      const message = error instanceof Error ? error.message : String(error);
      setLoadState({ status: 'error', message });
    }
  }

  function disposeFrame(): void {
    loadGeneration += 1;
    applicationCleanup?.();
    applicationCleanup = undefined;
    if (hook) {
      for (const inspector of hook.inspectors) inspector.dispose();
      hook.restore();
      hook = undefined;
    }
  }

  const iframeTitle = () => props.iframeTitle ?? 'Inspected WebGL page';

  return (
    <main class="wgsd-split-view">
      <section class="wgsd-split-view__page" aria-label={iframeTitle()}>
        <header class="wgsd-split-view__bar">
          <div>
            <span>inspected page</span>
            <strong>{iframeTitle()}</strong>
          </div>
          <div class="wgsd-split-view__bar-actions">
            {props.pageControls}
            <Button type="button" onClick={() => void loadFrame(currentSource())}>
              Reload page
            </Button>
          </div>
        </header>
        <iframe ref={iframe} title={iframeTitle()} sandbox="allow-same-origin allow-scripts" />
      </section>

      <section class="wgsd-split-view__diagram" aria-label="WebGL state diagram">
        <Show when={inspectors().length > 1}>
          <label class="wgsd-split-view__context">
            Context
            <select
              value={selectedInspector()}
              onChange={(event) => setSelectedInspector(event.currentTarget.selectedIndex)}
            >
              <For each={inspectors()}>{(_, index) => <option>WebGL context {index() + 1}</option>}</For>
            </select>
          </label>
        </Show>

        <Show when={activeInspector()} keyed fallback={<FrameStatus state={loadState()} />}>
          {(inspector) => (
            <WebGLStateDiagram
              inspector={inspector}
              title={props.diagramTitle ?? `${iframeTitle()} · WebGL state`}
              initialHelpOpen={props.initialHelpOpen ?? false}
              externalCanvasLabel="The canvas is rendered in the inspected page pane."
            />
          )}
        </Show>
      </section>
    </main>
  );
}

type IframeLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'waiting' }
  | { readonly status: 'ready' }
  | { readonly status: 'error'; readonly message: string };

function FrameStatus(props: { readonly state: IframeLoadState }): JSX.Element {
  return (
    <div class={`wgsd-frame-status is-${props.state.status}`}>
      <Show when={props.state.status === 'loading'}>Loading the inspected page…</Show>
      <Show when={props.state.status === 'waiting'}>Waiting for the page to create a WebGL or WebGL2 context.</Show>
      <Show when={props.state.status === 'error'}>{props.state.status === 'error' ? props.state.message : ''}</Show>
    </div>
  );
}

interface ResolvedFrameSource {
  readonly html: string;
}

async function resolveFrameSource(source: WebGLIframeSource): Promise<ResolvedFrameSource> {
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
