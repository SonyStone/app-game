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
import { useGpuCanvas } from '../../shared/gpu/GpuCanvasProvider';
import { onGpuRelease } from '../../shared/gpu/onGpuRelease';
import { pendingGpuPreparation } from '../../shared/gpu/serializeGpuPreparation';
import { runWithContext } from '../../shared/jsx/TokenContext';
import { ViewportContext, type Viewport } from '../viewport/createViewport';
import { createFrameScheduler, type FrameSubscription } from './createFrameScheduler';
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
  const loop = createFrameScheduler(
    () => {
      let submitted = false;
      const drawn = gate.draw(
        () =>
          renderScene(
            gpu,
            layers().map((layer) => layer.draw)
          ).map(() => {
            submitted = true;
          }),
        { resized }
      );

      return drawn.map(() => submitted);
    },
    (error) => props.onError(error),
    track
  );

  const gate = makeGpuFrameGate({
    complete: () => gpu.device.queue.onSubmittedWorkDone(),
    // Document preparation holds a device-wide validation error scope across awaits. A frame submitted meanwhile
    // would have its validation errors attributed to preparation and hidden from uncapturederror, so wait instead.
    blocked: () => pendingGpuPreparation(gpu.device),
    invalidate: loop.invalidate,
    fail: loop.fail
  });

  onGpuRelease(gpu.signal, () => {
    gate.destroy();
    loop.stop();
  });

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
    runWithContext(FrameContext, loop, () => {
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

const FrameContext = createContext<ReturnType<typeof createFrameScheduler>>();

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
