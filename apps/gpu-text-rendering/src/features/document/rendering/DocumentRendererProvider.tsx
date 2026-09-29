import { makeEventListener } from '@solid-primitives/event-listener';
import type { JSX } from '@solidjs/web';
import { createContext, createSignal, onCleanup, Show, untrack, useContext } from 'solid-js';
import type { DocumentError, ViewerError } from '../../../shared/errors';
import { useGpuCanvas } from '../../../shared/gpu/GpuCanvasProvider';
import { TokenContext } from '../../../shared/jsx/TokenContext';
import { runWorkerRequest } from '../../../shared/worker/runWorkerRequest';
import { useDocumentCamera } from '../../camera/DocumentCamera';
import { resolveSceneChildren } from '../../scene/resolveSceneChildren';
import { useViewport } from '../../viewport/Viewport';
import type { TextDocument } from '../document';
import { createFrame, type SceneFrame } from './createFrame';
import { createTypeGpuRenderer, type TextRenderer } from './createTypeGpuRenderer';
import type { buildCoverageTables, CoverageTables } from './curves/buildCoverageTables';
import CoverageWorker from './curves/coverage.worker?worker';
import { createRasterWorker } from './curves/createRasterWorker';

/**
 * Prepares each document once; replacement disposes its renderer and all child frame subscriptions.
 * Takes ownership of decoded bitmaps, closing them after upload or cancellation.
 */
export function DocumentRendererProvider(props: {
  document: TextDocument;
  /** Initial pages to prepare. 'viewport' captures the enclosing camera and viewport once; omit to prewarm all pages. */
  initialFrame?: SceneFrame | 'viewport';
  /** JSX or a function mounted only when ready, beneath the document context and owned by this session. */
  children: JSX.Element | ((value: ReturnType<typeof useDocumentRenderer>) => JSX.Element);
  loading?: JSX.Element;
  error: (error: ViewerError) => JSX.Element;
  /** Reports residency changes as visible images enter or leave the GPU cache. */
  onResourceUsage?: (bytes: number) => void;
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
    const coverage = (input: Parameters<typeof buildCoverageTables>[0]) =>
      runWorkerRequest<typeof input, CoverageTables, DocumentError>(() => new CoverageWorker(), input, {
        signal: abort.signal
      });
    let renderer: TextRenderer | undefined;

    onCleanup(dispose);
    makeEventListener(gpu.signal, 'abort', dispose, { once: true });

    const started = performance.now();
    const initialFrame = untrack(() => {
      if (props.initialFrame !== 'viewport') {
        return props.initialFrame;
      }
      const { pixels, css } = useViewport().size();
      return createFrame(document, useDocumentCamera(), pixels.width, pixels.height, false, false, css);
    });
    void createTypeGpuRenderer(gpu, document, { raster, coverage }, abort.signal, initialFrame).then((result) => {
      if (abort.signal.aborted || gpu.signal.aborted) {
        if (result.isOk()) {
          result.value.destroy();
        }

        return;
      }

      if (result.isErr()) {
        dispose();
      } else {
        renderer = result.value;
        closeImages();
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
                {resolveSceneChildren(props.children, value)}
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
      closeImages();
    }

    function closeImages() {
      document.images.forEach((image) => image.close());
      document.images.clear();
    }
  }
}

/** Reads a prepared renderer beneath DocumentRendererProvider. Its provider retains ownership. */
export function useDocumentRenderer() {
  return useContext(DocumentContext);
}

const DocumentContext = createContext<{ document: TextDocument; renderer: TextRenderer }>();
