import { createMemo } from 'solid-js';
import { RenderLayer, type ScenePointerEvent } from '../scene/RenderLayer';
import { useSceneSpace, type Point } from '../scene/SceneSpace';
import { createRectanglesDraw } from './createRectanglesDraw';

/**
 * Draws a reactive rectangle in the nearest SceneSpace. Owns its GPU buffers until disposal.
 * With pointer handlers it also receives presses on its area; see ScenePointerHandlers for capture rules.
 */
export function Rectangle(props: {
  /** Corner in SceneSpace units. */
  x: number;
  y: number;
  /** Extent from the corner in SceneSpace units; may be negative. */
  width: number;
  height: number;
  /** Straight RGBA components in the range 0–1. */
  color: readonly [number, number, number, number];
  /** Painter order, default 0. Use a larger value to draw over the document. */
  order?: number;
  /** Hides the rectangle and ignores pointers while retaining its GPU resources. Default true. */
  visible?: boolean;
  /** Press on the rectangle's area. Providing it makes the rectangle block presses to layers and controls below. */
  onPointerDown?: (event: RectanglePointerEvent) => void;
  /** Moves of a pointer this rectangle captured on press. */
  onPointerMove?: (event: RectanglePointerEvent) => void;
  /** Release or cancellation of a pointer this rectangle captured on press. */
  onPointerUp?: (event: RectanglePointerEvent) => void;
}) {
  const space = useSceneSpace();
  const items = createMemo(() => [{ x: props.x, y: props.y, width: props.width, height: props.height }]);
  const draw = createRectanglesDraw(items, () => props.color);

  const local = (event: ScenePointerEvent): RectanglePointerEvent => ({
    ...event,
    point: space.fromScreen(event.screen)
  });

  return (
    <RenderLayer
      order={props.order}
      visible={props.visible}
      draw={draw}
      hitTest={(screen) => {
        const { x, y } = space.fromScreen(screen);
        const [minX, maxX] = [props.x, props.x + props.width].sort((a, b) => a - b);
        const [minY, maxY] = [props.y, props.y + props.height].sort((a, b) => a - b);

        return x >= minX! && x <= maxX! && y >= minY! && y <= maxY!;
      }}
      onPointerDown={props.onPointerDown && ((event) => props.onPointerDown?.(local(event)))}
      onPointerMove={(event) => props.onPointerMove?.(local(event))}
      onPointerUp={(event) => props.onPointerUp?.(local(event))}
    />
  );
}

/** A scene pointer event with its position in the rectangle's SceneSpace. */
export type RectanglePointerEvent = ScenePointerEvent & { point: Point };
