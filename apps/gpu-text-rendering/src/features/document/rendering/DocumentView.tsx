import { useGpuDevice } from '@app-game/solid-gpu/gpu';
import { makeEventListener } from '@solid-primitives/event-listener';
import { onCleanup, Show } from 'solid-js';
import type { DocumentCamera } from '../../camera/createDocumentCamera';
import { createDynamicResolution } from '../../scene/createDynamicResolution';
import { useFrame, useFrameLoop } from '../../scene/FrameLoop';
import { gpuFrameBudgetMs, gpuFrameTimer } from '../../scene/gpuFrameTimer';
import { RenderLayer } from '../../scene/RenderLayer';
import type { SceneDraw } from '../../scene/renderScene';
import { useViewport } from '../../viewport/createViewport';
import { createFrame } from './createFrame';
import { createMotionCache } from './createMotionCache';
import { createSettledView } from './createSettledView';
import { useDocumentRenderer } from './DocumentRenderer';

/**
 * Draws the prepared document into this FrameLoop's canvas through `camera`, as a RenderLayer, once the renderer is
 * ready. Shared by GlyphText and VectorArtwork. Each mounted view streams its own visible images and tiles; unmounting
 * ends the view without affecting the renderer or other canvases.
 */
export function DocumentView(props: {
  /** Camera read on every draw; fixed for the view's lifetime. */
  camera: DocumentCamera;
  /** Draw only vectors instead of the engine's cached or atlas path. Default false. */
  vectorOnly?: boolean;
  /** Show the glyph grid overlay, where the engine supports it. Default false. */
  grids?: boolean;
  /** Higher values draw on top; equal values follow JSX order. Default 0. */
  order?: number;
  /** Skip drawing while retaining the view. Default true. */
  visible?: boolean;
}) {
  const { document, renderer } = useDocumentRenderer();
  const loop = useFrameLoop();
  const viewport = useViewport();
  const gpu = useGpuDevice();
  const { camera } = props.camera;

  return (
    <Show when={renderer()} keyed>
      {(renderer) => {
        const view = renderer.createView();
        onCleanup(view.destroy);
        let contentChanged = false;
        makeEventListener(renderer.events, 'change', () => {
          contentChanged = true;
          loop.invalidate();
        });

        const cache = createMotionCache(gpu);
        onCleanup(cache.destroy);
        const settledView = createSettledView(gpu);
        onCleanup(settledView.destroy);
        /** Whether the current or last gesture resampled cached views; such views also settle progressively. */
        let cachedGesture = false;
        /** Whether the latest cache refresh cost so little that its view could be drawn directly every frame. */
        let refreshFits = false;
        let wasMoving = false;
        // Refreshes render a widened view; their resolution adapts to their own cost, like moving frames'.
        const refreshResolution = createDynamicResolution({ budgetMs: refreshBudgetMs, scales: refreshScales });
        let caching = false;
        let previous: ReturnType<typeof camera> | undefined;
        let zoomingIn = false;

        // Before the frame is drawn, so the first frame of a gesture already counts as moving: a moving view lets the
        // loop draw motion below full resolution.
        useFrame(() => {
          const current = camera();

          if (previous && !sameCamera(previous, current)) {
            loop.reportMotion();
            zoomingIn = current.zoom < previous.zoom;
          }

          previous = current;
        });

        const draw: SceneDraw = ({ pass, width, height, moving, strained, scale }) => {
          const current = camera();
          // Zooming in never uncovers area around a cached view, so it needs little margin and cheaper refreshes.
          const margin = zoomingIn ? zoomInMargin : cacheMargin;
          const options = {
            vectorOnly: props.vectorOnly,
            grids: props.grids,
            moving,
            displaySize: viewport.size().css
          };
          const frame = createFrame(document, current, width, height, options);
          // Motion too slow even at the smallest scale resamples cached renderings until it stops, when the view is
          // drawn exactly again, band by band. Devices that keep up, at full or reduced resolution, never cache.
          // A gesture following one that had to cache starts cached, instead of first proving slow again, unless that
          // gesture's last refresh showed the view has become cheap enough to draw directly.
          if (moving && !wasMoving) {
            caching = cachedGesture && !refreshFits;
            cachedGesture = false;
            refreshFits = false;
          }

          wasMoving = moving;
          caching = moving && (caching || strained);
          cachedGesture ||= caching;

          if (!caching && (moving || !cachedGesture)) {
            cache.invalidate();
            settledView.invalidate();
            return view.draw(pass, frame);
          }

          if (!moving) {
            return drawSettling(pass, frame);
          }

          settledView.invalidate();

          if (cache.draw(pass, frame)) {
            return;
          }

          // No finer than this frame, whose scale already reflects how slow motion is; finer refreshes would also
          // request finer page tiles. Their own cost may lower it further.
          const refreshScale = (Math.min(refreshResolution.scale, scale) * margin) / scale;
          const widened = createFrame(
            document,
            { ...current, zoom: current.zoom * margin },
            Math.max(1, Math.round(width * refreshScale)),
            Math.max(1, Math.round(height * refreshScale)),
            options
          );
          const started = performance.now();
          const rendered = cache.refresh(frame, widened, (cachePass) => view.draw(cachePass, widened));

          if (rendered?.isErr()) {
            return rendered;
          }

          // A refresh draws more than a frame of the same view, so when even the frame holding one fits the budget,
          // the view no longer needs caching.
          void gpuFrameTimer(gpu.device)
            .cost()
            .then((cost) => {
              refreshFits = cost !== undefined && cost.ms <= gpuFrameBudgetMs;
            });

          void gpu.device.queue
            .onSubmittedWorkDone()
            .then(() => refreshResolution.observe({ ms: performance.now() - started }));
          cache.draw(pass, frame);
        };

        /**
         * Draws a still frame of a view too slow to draw at once: the next band of its exact rendering, shown once
         * complete; until then the previous settled rendering or the motion cache. Content changing while bands are
         * drawn is redrawn after they finish, so a rendering always completes.
         */
        function drawSettling(pass: GPURenderPassEncoder, frame: ReturnType<typeof createFrame>) {
          const pending = settledView.pendingFor(frame);
          const restart = contentChanged && !pending;

          if (restart) {
            contentChanged = false;
          } else if (!pending && settledView.draw(pass, frame)) {
            return;
          }

          const { result, settled } = settledView.renderBand(frame, restart, (bandPass) => view.draw(bandPass, frame));

          if (result?.isErr()) {
            return result;
          }

          if (!settled || contentChanged) {
            loop.invalidate();
          }

          if (settledView.draw(pass, frame) || cache.draw(pass, frame)) {
            return;
          }

          // Nothing cached to show meanwhile; draw directly rather than leave the view empty.
          return view.draw(pass, frame);
        }

        return <RenderLayer draw={draw} order={props.order} visible={props.visible} />;
      }}
    </Show>
  );
}

/** Side of a cached view relative to the frame: an eighth of the frame on every side for pans and zooming out. */
const cacheMargin = 1.25;
/** Side of a cached view refreshed while zooming in: just enough for a drifting pinch. */
const zoomInMargin = 1.1;
/** A refresh draws more than a frame and happens once per margin or zoom step, so it may take about two frames. */
const refreshBudgetMs = 2000 / 60;
/** Refresh resolutions relative to the widened view's full resolution. */
const refreshScales = [1, 0.85, 0.7, 0.55, 0.4];

function sameCamera(a: { x: number; y: number; zoom: number; rotation: number }, b: typeof a) {
  return a.x === b.x && a.y === b.y && a.zoom === b.zoom && a.rotation === b.rotation;
}
