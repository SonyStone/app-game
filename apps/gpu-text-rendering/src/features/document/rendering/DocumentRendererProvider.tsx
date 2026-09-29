import { makeEventListener } from '@solid-primitives/event-listener';
import type { JSX } from '@solidjs/web';
import { createContext, createSignal, Show, untrack, useContext } from 'solid-js';
import type { ViewerError } from '../../../shared/errors';
import { useGpuCanvas } from '../../../shared/gpu/GpuCanvasProvider';
import { onGpuRelease } from '../../../shared/gpu/onGpuRelease';
import { TokenContext } from '../../../shared/jsx/TokenContext';
import { useDocumentCamera } from '../../camera/DocumentCamera';
import { useViewport } from '../../viewport/Viewport';
import type { TextDocument } from '../document';
import { buildCoverage } from '../documentWorkerProtocol';
import { createFrame, type SceneFrame } from './createFrame';
import { createTypeGpuRenderer, type TextRenderer } from './createTypeGpuRenderer';
import { createRasterWorker } from './curves/createRasterWorker';
import type { DocumentWorkers } from './DocumentWorkers';

/**
 * Prepares each document once; replacement disposes its renderer and all child frame subscriptions.
 * Supports one DocumentLayer: the renderer writes a single view uniform per draw, so mount another provider
 * to draw the same document twice.
 */
export function DocumentRendererProvider(props: {
  document: TextDocument;
  /** Initial pages to prepare. 'viewport' captures the enclosing camera and viewport once; omit to prewarm all pages. */
  initialFrame?: SceneFrame | 'viewport';
  /** Mounted only when ready, beneath the document context and owned by this session. */
  children: JSX.Element;
  /** Shown while the document prepares. Default nothing. */
  loading?: JSX.Element;
  /** Renders a preparation failure in place of children; called once per failed document. */
  error: (error: ViewerError) => JSX.Element;
  /** Reports residency changes as visible images enter or leave the GPU cache. */
  onResourceUsage?: (bytes: number) => void;
  /** Called once when preparation succeeds, with its duration and estimated GPU bytes. */
  onReady?: (info: { preparationMs: number; resourceBytes: number }) => void;
}) {
  return (
    <Show when={props.document} keyed>
      {prepare}
    </Show>
  );

  function prepare(document: TextDocument) {
    const gpu = useGpuCanvas();
    // Loading resolves JSX children and would consume draw tokens before FrameLoop can read them.
    const [prepared, setPrepared] = createSignal<Awaited<ReturnType<typeof createTypeGpuRenderer>>>();
    const raster = createRasterWorker();
    const abort = new AbortController();
    const coverage: DocumentWorkers['coverage'] = (input) => buildCoverage(input, { signal: abort.signal });
    let renderer: TextRenderer | undefined;

    onGpuRelease(gpu.signal, dispose);

    const started = performance.now();
    const initialFrame = untrack(() => {
      if (props.initialFrame !== 'viewport') {
        return props.initialFrame;
      }
      const { pixels, css } = useViewport().size();
      return createFrame(document, useDocumentCamera().camera(), pixels.width, pixels.height, { displaySize: css });
    });
    void createTypeGpuRenderer(gpu, document, {
      workers: { raster, coverage },
      signal: abort.signal,
      initialFrame
    }).then((result) => {
      // A renderer destroys itself when its preparation signal or canvas aborts, and GPU abort disposes this session.
      if (abort.signal.aborted) {
        return;
      }

      if (result.isErr()) {
        dispose();
      } else {
        renderer = result.value;
        props.onReady?.({ preparationMs: performance.now() - started, resourceBytes: renderer.resourceBytes });
      }

      setPrepared(result);
    });

    return (
      <Show when={prepared()} fallback={props.loading} keyed>
        {(result) =>
          result.match((renderer) => {
            const value = { document, renderer };
            makeEventListener(renderer.events, 'change', () => props.onResourceUsage?.(renderer.resourceBytes), {
              signal: abort.signal
            });
            return (
              <TokenContext context={DocumentContext} value={value}>
                {props.children}
              </TokenContext>
            );
          }, props.error)
        }
      </Show>
    );

    function dispose() {
      if (abort.signal.aborted) {
        return;
      }

      abort.abort();
      raster.destroy();
      renderer?.destroy();
    }
  }
}

/** Reads a prepared renderer beneath DocumentRendererProvider. Its provider retains ownership. */
export function useDocumentRenderer() {
  return useContext(DocumentContext);
}

const DocumentContext = createContext<{ document: TextDocument; renderer: TextRenderer }>();
