import type { Point } from '@app-game/paint-core/camera';
import styles from './BrushCursor.module.css';

/** Outline of the brush footprint at the pointer, drawn over the canvas while the pointer hovers it. */
export function BrushCursor(props: {
  /** Pointer position in CSS pixels relative to the canvas. */
  point: Point;
  /** Diameter in CSS pixels. */
  size: number;
  /** Square outline, for block erasers. */
  square: boolean;
}) {
  return (
    <div
      class={styles.brushCursor}
      style={{
        left: `${props.point.x}px`,
        top: `${props.point.y}px`,
        width: `${props.size}px`,
        height: `${props.size}px`,
        'border-radius': props.square ? '0' : undefined
      }}
    />
  );
}
