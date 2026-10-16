import { Show } from 'solid-js';
import type { ShapeHint as Hint } from './createQuickShape';
import styles from './QuickShape.module.css';

/** Names the shape being edited over the canvas, and how to snap it, while the pen that made it is down. */
export function QuickShapeHint(props: { hint: Hint }) {
  return (
    <div class={styles.hint} role="status">
      <strong>{props.hint.name}</strong>
      <Show when={props.hint.snap}>
        {(snap) => (
          <span data-snapping={props.hint.snapping}>
            {props.hint.snapping ? `Snapped: ${snap()}` : `Shift or a finger: ${snap()}`}
          </span>
        )}
      </Show>
    </div>
  );
}
