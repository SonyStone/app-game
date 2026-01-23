/**
 * CanvasView - WebGPU canvas component
 *
 * Handles:
 * - Canvas element rendering
 * - Pointer input for drawing
 * - Canvas transform (pan, zoom, rotate)
 * - Resize handling
 */

import { createEffect, on, onCleanup, onMount, type Accessor, type JSX } from 'solid-js';
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

  /** Additional styles */
  style?: JSX.CSSProperties;
}

export function CanvasView(props: CanvasViewProps): JSX.Element {
  let canvasRef!: HTMLCanvasElement;

  // Forward the ref to parent
  const setRef = (el: HTMLCanvasElement) => {
    canvasRef = el;
    props.ref(el);
  };

  // Setup pointer input for drawing
  createEffect(
    on(
      () => canvasRef,
      () => {
        if (!canvasRef) return;

        usePointerInput({
          canvas: () => canvasRef,
          transform: props.transform,
          onStroke: props.onStroke,
          onStrokeEnd: props.onStrokeEnd,
          brushSize: props.brushSize,
          brushSpacing: props.brushSpacing,
          canvasWidth: props.canvasWidth,
          canvasHeight: props.canvasHeight
        });
      }
    )
  );

  // Setup canvas transform (pan, zoom, rotate)
  createEffect(
    on(
      () => canvasRef,
      () => {
        if (!canvasRef) return;

        useCanvasTransform({
          canvas: () => canvasRef,
          transform: props.transform,
          onTransformChange: props.onTransformChange
        });
      }
    )
  );

  // Setup resize listener
  onMount(() => {
    if (props.onResize) {
      window.addEventListener('resize', props.onResize);
    }
  });

  onCleanup(() => {
    if (props.onResize) {
      window.removeEventListener('resize', props.onResize);
    }
  });

  return (
    <canvas
      ref={setRef}
      style={{
        flex: 1,
        width: '100%',
        cursor: props.cursor ?? 'crosshair',
        'touch-action': 'none',
        ...props.style
      }}
    />
  );
}

export default CanvasView;
