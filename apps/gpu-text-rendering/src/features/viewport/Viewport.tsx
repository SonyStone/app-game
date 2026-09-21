import { makeEventListener } from '@solid-primitives/event-listener';
import { createElementSize } from '@solid-primitives/resize-observer';
import type { JSX } from '@solidjs/web';
import { createContext, createEffect, createMemo, createSignal, useContext } from 'solid-js';
import { useGpuCanvas } from '../../shared/gpu/GpuCanvasProvider';
import type { Point } from '../camera/camera';
import { measureViewport } from './measureViewport';

/** Owns canvas sizing. Place above FrameLoop; CSS must determine the canvas display size. */
export function Viewport(props: {
  children: JSX.Element;
  /** Maximum pixel ratio, default 2. GPU dimension limits can reduce it further. */
  maxDpr?: number;
}) {
  const gpu = useGpuCanvas();
  const viewport = createViewport(
    gpu.context.canvas as HTMLCanvasElement,
    () => props.maxDpr ?? 2,
    gpu.device.limits.maxTextureDimension2D
  );

  return <ViewportContext value={viewport}>{props.children}</ViewportContext>;
}

/** Reads shared CSS/framebuffer sizing and pointer conversions beneath Viewport. */
export function useViewport() {
  return useContext(ViewportContext);
}

function createViewport(canvas: HTMLCanvasElement, maxDpr: () => number, maxDimension: number) {
  const measured = createElementSize(canvas);
  const [deviceDpr, setDeviceDpr] = createSignal(window.devicePixelRatio || 1, { ownedWrite: true });
  const refreshDpr = () => setDeviceDpr(window.devicePixelRatio || 1);

  makeEventListener(window, 'resize', refreshDpr);

  createEffect(deviceDpr, (ratio) => {
    const query = window.matchMedia(`(resolution: ${ratio}dppx)`);
    return makeEventListener(query, 'change', refreshDpr);
  });

  const size = createMemo(() => measureViewport(measured.width, measured.height, deviceDpr(), maxDpr(), maxDimension));

  createEffect(size, ({ pixels }) => {
    if (canvas.width !== pixels.width) {
      canvas.width = pixels.width;
    }

    if (canvas.height !== pixels.height) {
      canvas.height = pixels.height;
    }
  });

  const viewport = {
    size,

    /** Converts browser client coordinates to canvas-local CSS pixels, including the current scroll offset. */
    clientToScreen(point: Point): Point {
      const rect = canvas.getBoundingClientRect();
      return { x: point.x - rect.left, y: point.y - rect.top };
    },

    /** Converts canvas-local CSS pixels to actual framebuffer pixels, accounting for rounded dimensions. */
    screenToPixel(point: Point): Point {
      const { css, pixels } = size();
      return { x: (point.x * pixels.width) / css.width, y: (point.y * pixels.height) / css.height };
    },

    /** Converts framebuffer pixels to canvas-local CSS pixels. */
    pixelToScreen(point: Point): Point {
      const { css, pixels } = size();
      return { x: (point.x * css.width) / pixels.width, y: (point.y * css.height) / pixels.height };
    },

    /** Converts canvas-local CSS coordinates to WebGPU clip coordinates. */
    screenToClip(point: Point): Point {
      const { css } = size();
      return { x: (2 * point.x) / css.width - 1, y: 1 - (2 * point.y) / css.height };
    }
  };

  return viewport;
}

const ViewportContext = createContext<ReturnType<typeof createViewport>>();
