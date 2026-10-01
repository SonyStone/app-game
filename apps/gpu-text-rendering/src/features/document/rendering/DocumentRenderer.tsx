import { onGpuRelease, useGpuDevice } from '@app-game/solid-gpu/gpu';
import { makeEventListener } from '@solid-primitives/event-listener';
import type { JSX } from '@solidjs/web';
import { createContext, createSignal, Show, untrack, useContext, type Accessor } from 'solid-js';
import type { ViewerError } from '../../../shared/errors';
import { TokenContext } from '../../../shared/jsx/TokenContext';
import type { DocumentCamera } from '../../camera/createDocumentCamera';
import type { Viewport } from '../../viewport/createViewport';
import type { TextDocument } from '../document';
import { buildCoverage } from '../documentWorkerProtocol';
import { createFrame } from './createFrame';
import { createCurveRenderer, createGlyphRenderer, type TextRenderer } from './createTypeGpuRenderer';
import { createDetailTableWorker } from './curves/createDetailTableWorker';
import { createRasterWorker } from './curves/createRasterWorker';

/**
 * Prepares one document on the GPU device, once, for every canvas beneath it: each canvas draws it through its own
 * view, GlyphText or VectorArtwork, with its own camera. Mount beneath TypeGPURootProvider and above the canvases.
 * Replacing the document, or releasing the device, disposes the renderer, its workers and every view.
 */
export function DocumentRenderer(props: {
  document: TextDocument;
  /** Limits initial image and page preparation to what this camera shows in this viewport; omit to prepare all. */
  initialView?: { camera: DocumentCamera; viewport: Viewport };
  /** Called once per failed preparation; views then draw nothing. Drawing failures go to each FrameLoop. */
  onError: (error: ViewerError) => void;
  /** Reports residency changes as visible images enter or leave the GPU cache. */
  onResourceUsage?: (bytes: number) => void;
  /** Called once when preparation succeeds, with its duration and estimated GPU bytes. */
  onReady?: (info: { preparationMs: number; resourceBytes: number }) => void;
  /** Canvases and their views; mounted immediately, while views wait for the renderer. */
  children: JSX.Element;
}) {
  return (
    <Show when={props.document} keyed>
      {prepare}
    </Show>
  );

  function prepare(document: TextDocument) {
    const gpu = useGpuDevice();
    const [renderer, setRenderer] = createSignal<TextRenderer>();
    const abort = new AbortController();
    // Only curve documents stream images and build coverage tables; prepareCurves creates their workers.
    let raster: ReturnType<typeof createRasterWorker> | undefined;
    let tables: ReturnType<typeof createDetailTableWorker> | undefined;
    let prepared: TextRenderer | undefined;

    onGpuRelease(gpu.signal, dispose);

    const started = performance.now();
    const initialFrame = untrack(() => {
      if (!props.initialView) {
        return undefined;
      }
      const { pixels, css } = props.initialView.viewport.size();
      return createFrame(document, props.initialView.camera.camera(), pixels.width, pixels.height, {
        displaySize: css
      });
    });
    const preparation =
      document.kind === 'curves'
        ? prepareCurves(document)
        : createGlyphRenderer(gpu, document, { signal: abort.signal });

    void preparation.then((result) => {
      // A renderer destroys itself when its preparation signal or device aborts, and device release disposes this.
      if (abort.signal.aborted) {
        return;
      }

      if (result.isErr()) {
        dispose();
        props.onError(result.error);
        return;
      }

      prepared = result.value;
      makeEventListener(prepared.events, 'change', () => props.onResourceUsage?.(prepared!.resourceBytes), {
        signal: abort.signal
      });
      props.onReady?.({ preparationMs: performance.now() - started, resourceBytes: prepared.resourceBytes });
      setRenderer(prepared);
    });

    return (
      <TokenContext context={DocumentRendererContext} value={{ document, renderer }}>
        {props.children}
      </TokenContext>
    );

    function prepareCurves(document: Extract<TextDocument, { kind: 'curves' }>) {
      raster = createRasterWorker();
      tables = createDetailTableWorker();

      return createCurveRenderer(gpu, document, {
        workers: { raster, tables, coverage: (input) => buildCoverage(input, { signal: abort.signal }) },
        signal: abort.signal,
        initialFrame
      });
    }

    function dispose() {
      if (abort.signal.aborted) {
        return;
      }

      abort.abort();
      raster?.destroy();
      tables?.destroy();
      prepared?.destroy();
    }
  }
}

/** Reads the prepared document beneath DocumentRenderer. A missing DocumentRenderer is a programming error. */
export function useDocumentRenderer() {
  return useContext(DocumentRendererContext);
}

const DocumentRendererContext = createContext<{
  /** The session's document; fixed, since a replacement starts a new session. */
  document: TextDocument;
  /** The prepared renderer; undefined while preparing and after a failure. */
  renderer: Accessor<TextRenderer | undefined>;
}>();
