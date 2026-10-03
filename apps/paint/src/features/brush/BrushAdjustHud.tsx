import type { Point } from '@app-game/paint-core/camera';
import styles from './BrushAdjustHud.module.css';

/**
 * Preview shown while dragging to adjust the brush: a disc at the drag anchor with the brush's on-screen size, color
 * and stroke opacity, and its size in document pixels and opacity as text.
 */
export function BrushAdjustHud(props: {
  /** Drag anchor in canvas CSS pixels. */
  anchor: Point;
  /** Brush size in document pixels. */
  size: number;
  /** Stroke opacity, 0–1. */
  opacity: number;
  color: string;
  /** View zoom, CSS pixels per document pixel. */
  zoom: number;
}) {
  // Very large brushes would cover the whole view; the label still reports their size.
  const diameter = () => Math.min(maxDiameter, Math.max(2, props.size * props.zoom));

  return (
    // Visual feedback only: announcing every drag step would flood screen readers; the Brush panel shows the values.
    <div class={styles.hud} style={{ left: `${props.anchor.x}px`, top: `${props.anchor.y}px` }} aria-hidden="true">
      <span
        class={styles.disc}
        style={{
          width: `${diameter()}px`,
          height: `${diameter()}px`,
          background: props.color,
          opacity: props.opacity
        }}
      />
      <span class={styles.label}>
        {Math.round(props.size)} px · {Math.round(props.opacity * 100)}%
      </span>
    </div>
  );
}

/** Largest preview disc, in CSS pixels. */
const maxDiameter = 600;
