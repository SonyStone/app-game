import { makeEventListener } from '@solid-primitives/event-listener';
import type { JSX } from '@solidjs/web';
import { createContext, createSignal, onCleanup, Show, untrack, useContext } from 'solid-js';
import type { ViewerError } from '../../../shared/errors';
import { useGpuCanvas } from '../../../shared/gpu/GpuCanvasProvider';
import { TokenContext } from '../../../shared/jsx/TokenContext';
import { resolveSceneChildren } from '../../scene/resolveSceneChildren';
import type { TextDocument } from '../document';
import { createTypeGpuRenderer, type TextRenderer } from './createTypeGpuRenderer';

/**
 * Prepares each document once; replacement disposes its renderer and all child frame subscriptions.
 * Takes ownership of decoded bitmaps, closing them after upload or cancellation.
 */
export function DocumentRendererProvider(props: {
  document: TextDocument;
  /** JSX or a function mounted only when ready, beneath the document context and owned by this session. */
  children: JSX.Element | ((value: ReturnType<typeof useDocumentRenderer>) => JSX.Element);
  loading?: JSX.Element;
  error: (error: ViewerError) => JSX.Element;
  onReady?: (info: { preparationMs: number; resourceBytes: number }) => void;
}) {
  return (
    <Show when={props.document} keyed>
      {(document) => (
        <DocumentSession document={document} loading={props.loading} error={props.error} onReady={props.onReady}>
          {props.children}
        </DocumentSession>
      )}
    </Show>
  );
}

/** Reads a prepared renderer beneath DocumentRendererProvider. Its provider retains ownership. */
export function useDocumentRenderer() {
  return useContext(DocumentContext);
}

function DocumentSession(props: Parameters<typeof DocumentRendererProvider>[0]) {
  const gpu = useGpuCanvas();
  const document = untrack(() => props.document);
  const [state, setState] = createSignal<PreparationState>({ status: 'loading' });
  const abort = new AbortController();
  let renderer: TextRenderer | undefined;

  onCleanup(dispose);
  makeEventListener(gpu.signal, 'abort', dispose, { once: true });

  const started = performance.now();
  void createTypeGpuRenderer(gpu, document, abort.signal).then((prepared) => {
    if (abort.signal.aborted || gpu.signal.aborted) {
      if (prepared.isOk()) {
        prepared.value.destroy();
      }

      return;
    }

    if (prepared.isErr()) {
      dispose();
      setState({ status: 'error', error: prepared.error });
      return;
    }

    renderer = prepared.value;
    closeImages();

    props.onReady?.({ preparationMs: performance.now() - started, resourceBytes: renderer.resourceBytes });
    setState({ status: 'ready', value: { document, renderer } });
  });

  const ready = () => {
    const current = state();
    return current.status === 'ready' ? current.value : undefined;
  };

  const failure = () => {
    const current = state();
    return current.status === 'error' ? current.error : undefined;
  };

  return (
    <Show
      when={ready()}
      keyed
      fallback={
        <Show when={failure()} keyed fallback={props.loading}>
          {props.error}
        </Show>
      }
    >
      {(value) => (
        <TokenContext context={DocumentContext} value={value}>
          {resolveSceneChildren(props.children, value)}
        </TokenContext>
      )}
    </Show>
  );

  function dispose() {
    if (abort.signal.aborted) {
      return;
    }

    abort.abort();
    renderer?.destroy();
    closeImages();
  }

  function closeImages() {
    document.images.forEach((image) => image.close());
    document.images.clear();
  }
}

type PreparationState =
  | { status: 'loading' }
  | { status: 'error'; error: ViewerError }
  | { status: 'ready'; value: { document: TextDocument; renderer: TextRenderer } };

const DocumentContext = createContext<{ document: TextDocument; renderer: TextRenderer }>();
