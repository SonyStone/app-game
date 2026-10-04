import styles from './Transform.module.css';

/** Transform commands: flips, a quarter turn and reset, and cancelling or applying the transform. */
export function TransformActions(props: {
  onFlip: (axis: 'x' | 'y') => void;
  onRotate: () => void;
  onReset: () => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  return (
    <div class={styles.actions} aria-label="Transform actions">
      <span role="status">Drag the box to move, its handles to scale, the round handle to rotate.</span>
      <div>
        <button onClick={() => props.onFlip('x')}>Flip horizontal</button>
        <button onClick={() => props.onFlip('y')}>Flip vertical</button>
        <button onClick={() => props.onRotate()}>Rotate 90°</button>
        <button onClick={() => props.onReset()}>Reset</button>
        <button onClick={() => props.onCancel()} title="Cancel · Escape">
          Cancel
        </button>
        <button class={styles.done} onClick={() => props.onDone()} title="Apply · Enter">
          Done
        </button>
      </div>
    </div>
  );
}
