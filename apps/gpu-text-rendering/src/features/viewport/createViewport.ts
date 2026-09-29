import { createEventListener, makeEventListener } from '@solid-primitives/event-listener';
import { createElementSize } from '@solid-primitives/resize-observer';
import { access, type MaybeAccessor } from '@solid-primitives/utils';
import { createContext, createEffect, createMemo, createSignal, useContext, type Accessor } from 'solid-js';
import type { Point } from '../scene/SceneSpace';
import { measureViewport } from './measureViewport';

/**
 * Owns canvas sizing for the caller's lifetime: measures the canvas's CSS size and device pixel ratio, and resizes
 * its framebuffer to match. The canvas may be replaced or absent; CSS must determine its display size.
 * Pass the result to FrameLoop, which provides it to scene components through useViewport.
 */
export function createViewport(
  canvas: Accessor<HTMLCanvasElement | undefined>,
  options: {
    /** Maximum pixel ratio, default 2. */
    maxDpr?: MaybeAccessor<number>;
    /** Largest framebuffer side in pixels. Default 8192, WebGPU's default maxTextureDimension2D. */
    maxDimension?: number;
  } = {}
) {
  const measured = createElementSize(canvas);
  // Written only by browser event listeners, outside any owned scope.
  const [deviceDpr, setDeviceDpr] = createSignal(window.devicePixelRatio || 1);
  const refreshDpr = () => setDeviceDpr(window.devicePixelRatio || 1);

  makeEventListener(window, 'resize', refreshDpr);

  // Re-queries the current resolution so the listener fires on the next DPR change, including zoom.
  createEventListener(() => window.matchMedia(`(resolution: ${deviceDpr()}dppx)`), 'change', refreshDpr);

  const size = createMemo(() =>
    measureViewport(
      measured.width ?? 0,
      measured.height ?? 0,
      deviceDpr(),
      access(options.maxDpr) ?? 2,
      options.maxDimension ?? 8192
    )
  );

  createEffect(
    () => ({ target: canvas(), pixels: size().pixels }),
    ({ target, pixels }) => {
      if (!target) {
        return;
      }

      if (target.width !== pixels.width) {
        target.width = pixels.width;
      }

      if (target.height !== pixels.height) {
        target.height = pixels.height;
      }
    }
  );

  return {
    /** CSS size, framebuffer size and effective pixel ratio of the canvas; 1×1 CSS pixels while it is absent. */
    size,

    /** Converts browser client coordinates to canvas-local CSS pixels, including the current scroll offset. */
    clientToScreen(point: Point): Point {
      const rect = canvas()?.getBoundingClientRect() ?? { left: 0, top: 0 };
      return { x: point.x - rect.left, y: point.y - rect.top };
    },

    /** Converts canvas-local CSS coordinates to WebGPU clip coordinates. */
    screenToClip(point: Point): Point {
      const { css } = size();
      return { x: (2 * point.x) / css.width - 1, y: 1 - (2 * point.y) / css.height };
    }
  };
}

/** Canvas sizing and pointer conversions shared by a scene; see createViewport. */
export type Viewport = ReturnType<typeof createViewport>;

/** Reads the viewport that the enclosing FrameLoop received. A missing FrameLoop is a programming error. */
export function useViewport() {
  return useContext(ViewportContext);
}

/** Provided by FrameLoop from its `viewport` prop. */
export const ViewportContext = createContext<Viewport>();
