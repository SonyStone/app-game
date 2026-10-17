import { Show } from 'solid-js';
import styles from './Readout.module.css';

/**
 * Infinite Painter's on-screen feedback (manual p. 49): while a value changes, a numerical readout at the top of the
 * screen, such as "Size: 80 px", and for the brush size a visual readout below it: the outer ring is the largest size,
 * the inner disc the current one, both at the view's zoom and capped to stay on screen. Visual only; the controls
 * announce their values themselves.
 */
export function Readout(props: {
  text: string;
  /** The current and largest brush diameters on screen, in CSS pixels. */
  ring?: { current: number; max: number };
  /** Fills the inner disc, such as the brush color. */
  color?: string;
}) {
  const scale = () => {
    const ring = props.ring;
    return ring && ring.max > maxRing ? maxRing / ring.max : 1;
  };

  return (
    <div class={styles.readout} aria-hidden="true">
      <span class={styles.text}>{props.text}</span>
      <Show when={props.ring}>
        {(ring) => (
          <span class={styles.outer} style={{ '--diameter': `${Math.max(8, ring().max * scale())}px` }}>
            <span
              class={styles.inner}
              style={{
                '--diameter': `${Math.max(3, ring().current * scale())}px`,
                background: props.color ?? '#1d1d1f'
              }}
            />
          </span>
        )}
      </Show>
    </div>
  );
}

/** The outer ring's largest diameter on screen, in CSS pixels; larger brushes shrink with it. */
const maxRing = 220;
