import { pressHandlers } from '../../shared/ui/pressHandlers';
import styles from './FloatingGrip.module.css';

/** A thin rim grip. Board-owned dragging applies the same tap threshold in Live and Edit. */
export function FloatingGrip(props: {
  /** Starts a captured panel drag; the grip consumes presses before they reach the canvas. */
  onDrag: (event: PointerEvent) => void;
}) {
  return (
    <div
      class={styles.grip}
      data-floating-grip
      aria-label="Move floating panel"
      {...pressHandlers({
        start: (_press, event) => {
          event.stopPropagation();
          props.onDrag(event);
        }
      })}
    >
      <span />
    </div>
  );
}
