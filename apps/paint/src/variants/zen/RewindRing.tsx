import { For } from 'solid-js';
import type { RewindDial } from './createRewind';
import styles from './ZenStudio.module.css';

/**
 * The rewind dial while a finger turns it: a hairline circle through the finger with a tick at every history step, and
 * the turn since the finger landed drawn darker along it. The step count shows in the pebble.
 */
export function RewindRing(props: { dial: RewindDial }) {
  const ticks = () => {
    const { center, radius, start, step } = props.dial;
    const count = Math.floor((2 * Math.PI) / step);
    return Array.from({ length: count }, (_, index) => {
      const angle = start + index * step;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return {
        x1: center.x + cos * (radius - 5),
        y1: center.y + sin * (radius - 5),
        x2: center.x + cos * (radius + 5),
        y2: center.y + sin * (radius + 5)
      };
    });
  };
  /** The turned arc as an SVG path; empty before the finger has moved. */
  const arc = () => {
    const { center, radius, start, turned } = props.dial;
    if (Math.abs(turned) < 0.01) {
      return '';
    }

    const sweep = Math.max(-2 * Math.PI + 0.01, Math.min(2 * Math.PI - 0.01, turned));
    const end = start + sweep;
    const from = { x: center.x + Math.cos(start) * radius, y: center.y + Math.sin(start) * radius };
    const to = { x: center.x + Math.cos(end) * radius, y: center.y + Math.sin(end) * radius };
    const large = Math.abs(sweep) > Math.PI ? 1 : 0;
    const clockwise = sweep > 0 ? 1 : 0;
    return `M${from.x} ${from.y}A${radius} ${radius} 0 ${large} ${clockwise} ${to.x} ${to.y}`;
  };

  return (
    <svg class={styles.rewind} aria-hidden="true">
      <circle cx={props.dial.center.x} cy={props.dial.center.y} r={props.dial.radius} class={styles.rewindTrack} />
      <For each={ticks()} keyed={false}>
        {(tick) => <line x1={tick().x1} y1={tick().y1} x2={tick().x2} y2={tick().y2} class={styles.rewindTick} />}
      </For>
      <path d={arc()} class={styles.rewindArc} />
    </svg>
  );
}
