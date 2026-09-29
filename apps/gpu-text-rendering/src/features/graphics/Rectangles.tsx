import { RenderLayer } from '../scene/RenderLayer';
import { createRectanglesDraw } from './createRectanglesDraw';

/**
 * Draws many same-colored rectangles in the nearest SceneSpace with one instanced draw. Use it instead of
 * one Rectangle per item for large or data-driven sets. Replacing `items` rewrites the instance buffer,
 * reallocating it only when the count changes. Items do not receive pointer events.
 */
export function Rectangles(props: {
  /** Rectangles in SceneSpace units. Width and height may be negative. */
  items: readonly { x: number; y: number; width: number; height: number }[];
  /** Straight RGBA components in the range 0–1. */
  color: readonly [number, number, number, number];
  /** Painter order, default 0. */
  order?: number;
  /** Hides the rectangles while retaining their GPU resources. Default true. */
  visible?: boolean;
}) {
  const draw = createRectanglesDraw(
    () => props.items,
    () => props.color
  );

  return <RenderLayer order={props.order} visible={props.visible} draw={draw} />;
}
