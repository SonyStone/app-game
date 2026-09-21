import { makeEventListener } from '@solid-primitives/event-listener';
import { resolveTokens } from '@solid-primitives/jsx-tokenizer';
import { createPageVisibility } from '@solid-primitives/page-utilities';
import type { JSX } from '@solidjs/web';
import { createContext, createEffect, createMemo, onCleanup, untrack, useContext, type Accessor } from 'solid-js';
import type { ViewerError } from '../../shared/errors';
import { useGpuCanvas } from '../../shared/gpu/GpuCanvasProvider';
import { useViewport } from '../viewport/Viewport';
import { createFrameScheduler, type FrameSubscription } from './createFrameScheduler';
import { RenderLayer } from './RenderLayer';
import { renderScene, type SceneDraw } from './renderScene';
import { resolveSceneChildren } from './resolveSceneChildren';

/**
 * Owns one demand-driven RAF loop and resolves draw tokens from a scene-only JSX subtree.
 * Update callbacks precede drawing; equal layer orders follow JSX order. DOM UI belongs outside this subtree.
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
  let layers: Accessor<SceneDraw[]> = () => [];

  const loop = createFrameScheduler(
    ({ timestamp }) => renderScene(gpu, layers(), timestamp),
    (error) => props.onError(error)
  );

  createEffect(visible, loop.setActive);
  createEffect(() => props.continuous ?? false, loop.setContinuous);
  createEffect(viewport.size, () => loop.invalidate());
  makeEventListener(gpu.signal, 'abort', loop.stop, { once: true });
  onCleanup(() => {
    layers = () => [];
  });

  if (gpu.signal.aborted) {
    loop.stop();
  }

  const resolveLayers = () => {
    const tokens = resolveTokens(RenderLayer, () => resolveSceneChildren(props.children, loop));

    layers = createMemo(() =>
      tokens()
        .filter(({ data }) => data.visible !== false)
        .map(({ data }) => ({ draw: data.draw, order: data.order ?? 0 }))
        .sort((a, b) => a.order - b.order)
        .map(({ draw }) => draw)
    );

    createEffect(layers, () => loop.invalidate());

    return null;
  };

  return <FrameContext value={loop}>{untrack(resolveLayers)}</FrameContext>;
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
