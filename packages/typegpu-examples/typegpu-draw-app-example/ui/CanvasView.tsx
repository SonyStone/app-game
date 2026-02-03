/**
 * CanvasView - WebGPU canvas component
 *
 * Handles:
 * - Canvas element rendering
 * - Pointer input for drawing
 * - Canvas transform (pan, zoom, rotate)
 * - Resize handling
 */

import { createResizeObserver } from '@solid-primitives/resize-observer';
import { createEffect, createSignal, on, type Accessor, type JSX } from 'solid-js';
import { useCanvasTransform } from '../canvas/useCanvasTransform';
import { usePointerInput } from '../canvas/usePointerInput';
import type { CanvasTransform, StrokePoint } from '../types';

export interface CanvasViewProps {
  /** Reference setter for the canvas element */
  ref: (el: HTMLCanvasElement) => void;

  /** Current canvas transform */
  transform: Accessor<CanvasTransform>;

  /** Transform change handler */
  onTransformChange: (transform: CanvasTransform) => void;

  /** Stroke handler - called with points during drawing */
  onStroke: (points: StrokePoint[]) => void;

  /** Stroke end handler - called when stroke is complete */
  onStrokeEnd: () => void;

  /** Current brush size */
  brushSize: Accessor<number>;

  /** Current brush spacing */
  brushSpacing: Accessor<number>;

  /** Canvas width (drawing buffer size) */
  canvasWidth: number;

  /** Canvas height (drawing buffer size) */
  canvasHeight: number;

  /** Resize handler */
  onResize?: () => void;

  /** Custom cursor style */
  cursor?: string;

  /** Additional class name */
  class?: string;

  /** Enable debug overlay for pointer events */
  debug?: Accessor<boolean>;

  /** Force pan mode - mouse input pans instead of drawing */
  forcePanMode?: Accessor<boolean>;
}

export function CanvasView(props: CanvasViewProps): JSX.Element {
  const [canvasRef, setCanvasRef] = createSignal<HTMLCanvasElement | undefined>(undefined);

  // Setup pointer input for drawing
  createEffect(
    on(canvasRef, () => {
      if (!canvasRef()) return;

      usePointerInput({
        canvas: canvasRef,
        transform: props.transform,
        onStroke: props.onStroke,
        onStrokeEnd: props.onStrokeEnd,
        brushSize: props.brushSize,
        brushSpacing: props.brushSpacing,
        canvasWidth: props.canvasWidth,
        canvasHeight: props.canvasHeight,
        forcePanMode: props.forcePanMode
      });
    })
  );

  // Setup canvas transform (pan, zoom, rotate)
  createEffect(
    on(
      () => canvasRef(),
      () => {
        if (!canvasRef()) return;

        useCanvasTransform({
          canvas: canvasRef,
          transform: props.transform,
          onTransformChange: props.onTransformChange,
          debug: props.debug,
          canvasWidth: props.canvasWidth,
          canvasHeight: props.canvasHeight,
          forcePanMode: props.forcePanMode
        });
      }
    )
  );

  // @ts-expect-error HTMLCanvasElement is an Element
  createResizeObserver(canvasRef, () => {
    props.onResize?.();
  });

  return (
    <canvas
      ref={(el) => {
        props.ref(el);
        setCanvasRef(el);
      }}
      class={`h-0 w-full flex-1 touch-none ${props.class ?? ''}`}
      style={{ cursor: props.cursor ?? 'crosshair' }}
    />
  );
}
