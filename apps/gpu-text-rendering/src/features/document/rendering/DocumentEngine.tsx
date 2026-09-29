import { makeEventListener } from '@solid-primitives/event-listener';
import { createSignal, Show, untrack } from 'solid-js';
import type { GpuContext } from '../../../shared/gpu/context';
import { useGpuCanvas } from '../../../shared/gpu/GpuCanvasProvider';
import { onGpuRelease } from '../../../shared/gpu/onGpuRelease';
import { useFrameLoop } from '../../scene/FrameLoop';
import { RenderLayer } from '../../scene/RenderLayer';
import type { SceneDraw } from '../../scene/renderScene';
import { useViewport } from '../../viewport/createViewport';
import { createFrame, type SceneFrame } from './createFrame';
import type { createTypeGpuRenderer, TextRenderer } from './createTypeGpuRenderer';
import { useDocumentRenderer } from './DocumentRenderer';

/**
 * Prepares the session's document with one engine's renderer and draws it as a RenderLayer once ready. Shared by
 * GlyphText and VectorArtwork. Unmounting, or releasing the GPU, cancels preparation and destroys the renderer.
 */
export function DocumentEngine(props: {
  /** Creates this engine's renderer; called once. `signal` aborts on disposal. */
  create: (
    gpu: GpuContext,
    options: { signal: AbortSignal; initialFrame: SceneFrame | undefined }
  ) => ReturnType<typeof createTypeGpuRenderer>;
  /** Draw only vectors instead of the engine's cached or atlas path. Default false. */
  vectorOnly?: boolean;
  /** Show the glyph grid overlay, where the engine supports it. Default false. */
  grids?: boolean;
  /** Higher values draw on top; equal values follow JSX order. Default 0. */
  order?: number;
  /** Skip drawing while retaining the prepared renderer. Default true. */
  visible?: boolean;
}) {
  const session = useDocumentRenderer();
  const { document } = session;
  const { camera } = session.camera;
  const gpu = useGpuCanvas();
  const loop = useFrameLoop();
  const viewport = useViewport();
  // Loading resolves JSX children and would consume draw tokens before FrameLoop can read them.
  const [prepared, setPrepared] = createSignal<Awaited<ReturnType<typeof createTypeGpuRenderer>>>();
  const abort = new AbortController();
  let renderer: TextRenderer | undefined;

  onGpuRelease(gpu.signal, dispose);

  const started = performance.now();
  const initialFrame = untrack(() => {
    const requested = session.initialFrame();
    if (requested !== 'viewport') {
      return requested;
    }
    const { pixels, css } = viewport.size();
    return createFrame(document, camera(), pixels.width, pixels.height, { displaySize: css });
  });
  void untrack(() => props.create(gpu, { signal: abort.signal, initialFrame })).then((result) => {
    // A renderer destroys itself when its preparation signal or canvas aborts, and GPU abort disposes this engine.
    if (abort.signal.aborted) {
      return;
    }

    if (result.isErr()) {
      dispose();
    } else {
      renderer = result.value;
      session.reportReady({ preparationMs: performance.now() - started, resourceBytes: renderer.resourceBytes });
    }

    setPrepared(result);
  });

  return (
    <Show when={prepared()} keyed>
      {(result) =>
        result.match(
          (renderer) => {
            makeEventListener(renderer.events, 'change', loop.invalidate);
            makeEventListener(renderer.events, 'change', () => session.reportResourceUsage(renderer.resourceBytes), {
              signal: abort.signal
            });

            const draw: SceneDraw = ({ pass, width, height }) =>
              renderer.draw(
                pass,
                createFrame(document, camera(), width, height, {
                  vectorOnly: props.vectorOnly,
                  grids: props.grids,
                  displaySize: viewport.size().css
                })
              );

            return <RenderLayer draw={draw} order={props.order} visible={props.visible} />;
          },
          (error) => {
            session.reportError(error);
            return null;
          }
        )
      }
    </Show>
  );

  function dispose() {
    if (abort.signal.aborted) {
      return;
    }

    abort.abort();
    renderer?.destroy();
  }
}
