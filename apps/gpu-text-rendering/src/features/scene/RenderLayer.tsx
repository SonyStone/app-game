import { createToken } from '@solid-primitives/jsx-tokenizer';
import type { Point } from './SceneSpace';
import type { SceneDraw } from './renderScene';

/**
 * Describes a draw layer for FrameLoop's token resolver; performs no registration or DOM rendering.
 * Higher order draws on top, default 0. Equal orders follow JSX order, including late async children.
 * Prop changes and reactive reads inside draw, such as the camera, request a new frame. Non-reactive state read
 * inside draw, such as renderer caches, needs an explicit invalidate.
 */
export const RenderLayer = createToken<
  {
    draw: SceneDraw;
    order?: number;
    /** Skips drawing and pointer events without disposing the component or its GPU resources. Default true. */
    visible?: boolean;
  } & ScenePointerHandlers
>();

/**
 * Pointer participation for a layer. FrameLoop offers a press to the topmost visible layer whose hitTest accepts
 * it and that handles pointerdown. That layer captures the pointer: it receives the moves and release even
 * outside its shape, and the press never reaches camera controls or layers beneath it.
 */
export type ScenePointerHandlers = {
  /** Whether a canvas-local CSS point lies on this layer. Layers without it never receive pointer events. */
  hitTest?: (point: Point) => boolean;
  onPointerDown?: (event: ScenePointerEvent) => void;
  /** Moves of a pointer captured by this layer's pointerdown. */
  onPointerMove?: (event: ScenePointerEvent) => void;
  /** Release or cancellation of a pointer captured by this layer's pointerdown. */
  onPointerUp?: (event: ScenePointerEvent) => void;
};

/** A pointer event with its canvas-local CSS position. */
export type ScenePointerEvent = {
  screen: Point;
  native: PointerEvent;
};
