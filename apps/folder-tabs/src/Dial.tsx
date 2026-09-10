import { createSignal } from 'solid-js';
import styles from './Dial.module.css';

/** A circular control; click or use arrow keys to rotate it in 30-degree increments. */
export function Dial(props: { label: string; angle: number }) {
  const [angle, setAngle] = createSignal(props.angle);
  return (
    <button
      class={styles.dial}
      aria-label={props.label}
      title="Click or use arrow keys to rotate"
      onClick={() => setAngle((value) => value + 30)}
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        setAngle((value) => value + (event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -30 : 30));
      }}
    >
      <span class={styles.dialRotor} style={{ '--angle': `${angle()}deg`, transform: `rotate(${angle()}deg)` }}>
        <span />
        <span />
      </span>
    </button>
  );
}
