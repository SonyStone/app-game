import { onGpuRelease, pendingGpuPreparation, useGpuCanvas } from '@app-game/solid-gpu/gpu';
import { resolveTokens } from '@solid-primitives/jsx-tokenizer';
import { createPageVisibility } from '@solid-primitives/page-utilities';
import { createResizeObserver } from '@solid-primitives/resize-observer';
import type { JSX } from '@solidjs/web';
import {
  createContext,
  createEffect,
  createMemo,
  createReaction,
  flush,
  untrack,
  useContext,
  type Accessor
} from 'solid-js';
import type { ViewerError } from '../../shared/errors';
import { runWithContext } from '../../shared/jsx/TokenContext';
import { ViewportContext, type Viewport } from '../viewport/createViewport';
import { createDynamicResolution } from './createDynamicResolution';
import { createFrameScheduler, type FrameSubscription } from './createFrameScheduler';
import { createSceneUpscaler } from './createSceneUpscaler';
import { gpuFrameBudgetMs, gpuFrameTimer, type FrameCost } from './gpuFrameTimer';
import { makeGpuFrameGate } from './makeGpuFrameGate';
import { makeScenePointerEvents } from './makeScenePointerEvents';
import { RenderLayer } from './RenderLayer';
import { renderScene } from './renderScene';

/**
 * Owns one demand-driven RAF loop and resolves draw tokens from a scene-only JSX subtree.
 * Update callbacks precede drawing; equal layer orders follow JSX order. DOM UI belongs outside this subtree.
 * Reactive reads in render-phase callbacks and layer draws, such as the camera, request the next frame when they
 * change; non-reactive state such as renderer caches still needs an explicit invalidate.
 * Scene components beneath it read the GPU canvas, this loop and the viewport from context.
 */
export function FrameLoop(props: {
  /** Canvas sizing from createViewport; read once and provided to descendants through useViewport. */
  viewport: Viewport;
  /** Scene components, resolved once beneath this loop's context. */
  children: JSX.Element;
  /** Called once after stopping a failed rendering session. */
  onError: (error: ViewerError) => void;
}) {
  const gpu = useGpuCanvas();
  const viewport = untrack(() => props.viewport);
  const visible = createPageVisibility();
  const track = trackFrames(() => loop.invalidate());

  let resized = false;
  // Moving frames that miss their budget draw below the canvas resolution; the frame after motion stops is full.
  const upscaler = createSceneUpscaler(gpu);
  const timer = gpuFrameTimer(gpu.device);
  const resolution = createDynamicResolution({ budgetMs: timer.supported ? gpuFrameBudgetMs : latencyBudgetMs });
  /**
   * When a layer last reported its view moving. Every frame shortly after counts as moving, including those drawn
   * for other reasons such as arriving tiles, which would otherwise interrupt a gesture with full-resolution frames.
   */
  let movedAt = -Infinity;
  /** The frame just submitted, read once by the gate's completion. */
  let submittedFrame:
    | { started: number; moving: boolean; scale: number; sequence: number; cost: Promise<FrameCost | undefined> }
    | undefined;
  let submittedScale = 1;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  const loop = createFrameScheduler(
    () => {
      const started = performance.now();
      const moving = !resized && started - movedAt < motionWindowMs;
      let submitted = false;
      const drawn = gate.draw(
        () => {
          const sequence = timer.begin(started);
          const cost = timer.cost();
          const scale = moving ? resolution.scaleFor(sequence) : 1;

          return renderScene(
            gpu,
            layers().map((layer) => layer.draw),
            scale < 1 ? { upscaler, scale } : undefined,
            { moving, strained: moving && resolution.strained }
          ).map(() => {
            submitted = true;
            submittedScale = scale;
            submittedFrame = { started, moving, scale, sequence, cost };
          });
        },
        { resized }
      );

      // Redraw exactly once motion pauses: moving frames may be scaled or resample a layer's cached view, and a frame
      // with no motion is neither.
      clearTimeout(settleTimer);

      if (submitted && moving) {
        settleTimer = setTimeout(() => loop.invalidate(), settleMs);
      }

      return drawn.map(() => submitted);
    },
    (error) => props.onError(error),
    track
  );

  const gate = makeGpuFrameGate({
    complete: () => {
      const frame = submittedFrame;
      submittedFrame = undefined;

      return gpu.device.queue.onSubmittedWorkDone().then(() => {
        if (!frame) {
          return;
        }

        const { moving, scale, sequence } = frame;
        const latency = performance.now() - frame.started;

        if (!moving) {
          return;
        }

        void frame.cost.then((cost) => {
          // The GPU's own time for the frame when the device measures it; else the time until it finished its queue,
          // which also counts presentation. A scaled frame's last pass stretches it over the canvas, the same work at
          // every scale.
          resolution.observe(
            cost
              ? { ms: cost.ms, fixedMs: scale < 1 ? cost.passMs.at(-1) : undefined, scale, sequence }
              : { ms: latency, scale, sequence }
          );
        });
      });
    },
    // Document preparation holds a device-wide validation error scope across awaits. A frame submitted meanwhile
    // would have its validation errors attributed to preparation and hidden from uncapturederror, so wait instead.
    blocked: () => pendingGpuPreparation(gpu.device),
    // A GPU that keeps up still reports frames finished only after presentation, more than a display interval later
    // right after idle; one more frame in flight then avoids skipping a refresh. Known only where GPU time is measured;
    // a GPU that falls behind keeps the shorter queue, so the view does not lag further behind the input.
    maxUnfinished: () => (timer.supported && !resolution.behind ? 3 : 2),
    invalidate: loop.invalidate,
    fail: loop.fail
  });

  onGpuRelease(gpu.signal, () => {
    clearTimeout(settleTimer);
    gate.destroy();
    loop.stop();
    upscaler.destroy();
  });

  /** The loop as seen by descendants: scheduling, plus reporting that a view moved. */
  const frameLoop = {
    ...loop,
    /** Marks this frame's view as moving, so continuing motion may draw below full resolution. */
    reportMotion() {
      movedAt = performance.now();
    },
    /** Framebuffer resolution of the latest submitted frame relative to the canvas; below 1 for scaled moving frames. */
    get scale() {
      return submittedScale;
    }
  };

  createEffect(visible, loop.setActive);
  createEffect(viewport.size, () => loop.invalidate());

  // Resizing the framebuffer clears the canvas after this frame's animation callbacks already ran, so the browser would
  // paint it blank until the next frame. Redraw before that paint instead. The viewport's observer was created first,
  // and observers are notified in creation order, so flushing applies its new size before this redraw.
  createResizeObserver(gpu.context.canvas as HTMLCanvasElement, () => {
    flush();
    resized = true;

    try {
      loop.redraw();
    } finally {
      resized = false;
    }
  });

  // Children resolve once beneath the loop's context. The provider's owner keeps the token and layer memos alive
  // for this component's lifetime; frames run from RAF callbacks, never during disposal, and the scheduler stops
  // with this owner.
  const layers = runWithContext(ViewportContext, viewport, () =>
    runWithContext(FrameContext, frameLoop, () => {
      const tokens = resolveTokens(RenderLayer, () => props.children);
      // Keep each token's props object: draws and pointer handlers are read when a frame or event happens.
      return createMemo(() =>
        tokens()
          .map(({ data }) => data)
          .filter((layer) => layer.visible !== false)
          .map((layer, index) => ({ layer, index, order: layer.order ?? 0 }))
          .sort((a, b) => a.order - b.order || a.index - b.index)
          .map(({ layer }) => layer)
      );
    })
  );

  makeScenePointerEvents(gpu.context.canvas as HTMLCanvasElement, layers, (event) =>
    viewport.clientToScreen({ x: event.clientX, y: event.clientY })
  );

  return null;
}

/** Reads frame invalidation and stopping controls beneath FrameLoop. */
export function useFrameLoop() {
  return useContext(FrameContext);
}

/**
 * Registers synchronous work for this Solid owner. Options are reactive through accessors.
 * A continuous subscription keeps the loop alive only while enabled.
 */
export function useFrame(
  callback: FrameSubscription['callback'],
  options: {
    /**
     * Update precedes render; both precede the GPU pass. Present follows a submitted pass, while the canvas image is
     * readable, and is skipped for frames the GPU gate defers. Default render.
     */
    phase?: FrameSubscription['phase'];
    /** Reactive participation flag, default true. Disabling unsubscribes this callback. */
    enabled?: Accessor<boolean>;
    /** Keep requesting frames while enabled, default false. Fixed for this subscription's lifetime. */
    continuous?: boolean;
  } = {}
) {
  const loop = useFrameLoop();

  createEffect(
    () => options.enabled?.() ?? true,
    (enabled) => {
      if (enabled) {
        return loop.subscribe({ callback, phase: options.phase ?? 'render', continuous: options.continuous ?? false });
      }
    }
  );
}

const FrameContext = createContext<
  ReturnType<typeof createFrameScheduler> & { reportMotion(): void; readonly scale: number }
>();

/** Budget of a moving frame on devices that only report when it finished: one 60 Hz interval, presentation included. */
const latencyBudgetMs = 1000 / 60;
/** Frames this soon after a view moved count as moving. */
const motionWindowMs = 150;
/** Quiet time after a scaled frame before the full-resolution redraw; longer than the motion window. */
const settleMs = 200;

/**
 * Records a frame's reactive reads and calls `changed` once when any of them changes. Each recorded frame
 * replaces the previous subscription, so it observes exactly what the latest frame read.
 */
function trackFrames(changed: () => void) {
  const reaction = createReaction(changed);
  let recording = false;

  return (record: () => void) => {
    recording = true;

    try {
      // Solid re-runs a reaction's tracking function when a source changes, before calling `changed`.
      // Only a scheduled frame may record; that re-run must not draw outside the RAF callback.
      reaction(() => {
        if (recording) {
          record();
        }
      });
    } finally {
      recording = false;
    }
  };
}
