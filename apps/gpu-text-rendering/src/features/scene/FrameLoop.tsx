import { makeEventListener } from '@solid-primitives/event-listener';
import { resolveTokens } from '@solid-primitives/jsx-tokenizer';
import { createPageVisibility } from '@solid-primitives/page-utilities';
import type { JSX } from '@solidjs/web';
import { ok } from 'neverthrow';
import {
  createContext,
  createEffect,
  createMemo,
  createReaction,
  onCleanup,
  useContext,
  type Accessor
} from 'solid-js';
import type { ViewerError } from '../../shared/errors';
import { useGpuCanvas } from '../../shared/gpu/GpuCanvasProvider';
import { pendingGpuPreparation } from '../../shared/gpu/serializeGpuPreparation';
import { runWithContext } from '../../shared/jsx/TokenContext';
import { useViewport } from '../viewport/Viewport';
import { createFrameScheduler, type FrameSubscription } from './createFrameScheduler';
import { makeGpuFrameGate } from './makeGpuFrameGate';
import { makeScenePointerEvents } from './makeScenePointerEvents';
import { RenderLayer } from './RenderLayer';
import { renderScene } from './renderScene';
import { resolveSceneChildren } from './resolveSceneChildren';

/**
 * Owns one demand-driven RAF loop and resolves draw tokens from a scene-only JSX subtree.
 * Update callbacks precede drawing; equal layer orders follow JSX order. DOM UI belongs outside this subtree.
 * Reactive reads in render-phase callbacks and layer draws request the next frame when they change;
 * non-reactive state such as the camera still needs an explicit invalidate.
 */
export function FrameLoop(props: {
  /** JSX or a render function evaluated beneath this loop's context, preserving component ownership. */
  children: JSX.Element | ((loop: ReturnType<typeof useFrameLoop>) => JSX.Element);
  /** Scene-wide override, default false. Prefer independent continuous useFrame subscriptions for animations. */
  continuous?: boolean;
  /** Called once after stopping a failed rendering session. */
  onError: (error: ViewerError) => void;
}) {
  const gpu = useGpuCanvas();
  const viewport = useViewport();
  const visible = createPageVisibility();
  let deferred = false;
  const track = trackFrames(() => loop.invalidate());

  const loop = createFrameScheduler(
    ({ timestamp }) => {
      // Document preparation holds a device-wide validation error scope across awaits. A frame submitted meanwhile
      // would have its validation errors attributed to preparation and hidden from uncapturederror, so wait instead.
      const preparing = pendingGpuPreparation(gpu.device);
      if (preparing) {
        if (!deferred) {
          deferred = true;
          void preparing.then(() => {
            deferred = false;
            loop.invalidate();
          });
        }
        return ok();
      }
      return gate.draw(() =>
        renderScene(
          gpu,
          layers().map((layer) => layer.draw),
          timestamp
        )
      );
    },
    (error) => props.onError(error),
    track
  );

  const gate = makeGpuFrameGate(() => gpu.device.queue.onSubmittedWorkDone(), loop.invalidate, loop.fail);
  onCleanup(gate.destroy);
  makeEventListener(gpu.signal, 'abort', gate.destroy, { once: true });

  createEffect(visible, loop.setActive);
  createEffect(() => props.continuous ?? false, loop.setContinuous);
  createEffect(viewport.size, () => loop.invalidate());
  makeEventListener(gpu.signal, 'abort', loop.stop, { once: true });

  if (gpu.signal.aborted) {
    loop.stop();
  }

  // Children resolve once beneath the loop's context. The provider's owner keeps the token and layer memos alive
  // for this component's lifetime; frames run from RAF callbacks, never during disposal, and the scheduler stops
  // with this owner.
  const layers = runWithContext(FrameContext, loop, () => {
    const tokens = resolveTokens(RenderLayer, () => resolveSceneChildren(props.children, loop));
    // Keep each token's props object: draws and pointer handlers are read when a frame or event happens.
    return createMemo(() =>
      tokens()
        .map(({ data }) => data)
        .filter((layer) => layer.visible !== false)
        .map((layer, index) => ({ layer, index, order: layer.order ?? 0 }))
        .sort((a, b) => a.order - b.order || a.index - b.index)
        .map(({ layer }) => layer)
    );
  });

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
 * A continuous subscription keeps the loop alive only while enabled. Both phases precede GPU draws.
 */
export function useFrame(
  callback: FrameSubscription['callback'],
  options: {
    /** Update precedes render; both precede the GPU pass. Default render. */
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
