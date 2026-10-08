import styles from './Knob.module.css';

/**
 * An encoder drawn flat: a 270° ring with the value arc lit warm white, and a cap with a pointer line. An unused
 * encoder (`fraction` undefined) shows only its dark ring. `bipolar` arcs grow from 12 o'clock both ways. Purely
 * visual: the element around it takes the presses.
 */
export function Knob(props: {
  fraction: number | undefined;
  bipolar?: boolean;
  /** Highlights the ring, for the encoder the keyboard turns. */
  selected?: boolean;
  /** Stops of a detented encoder, drawn as ticks outside the ring. */
  detents?: number;
  /** CSS size in pixels; 44 by default. */
  size?: number;
}) {
  const angle = () => startAngle + sweep * Math.min(1, Math.max(0, props.fraction ?? 0));
  const origin = () => (props.bipolar ? 270 : startAngle);

  return (
    <svg
      class={[styles.knob, { [styles.dead!]: props.fraction === undefined, [styles.selected!]: props.selected }]}
      width={props.size ?? 44}
      height={props.size ?? 44}
      viewBox="0 0 44 44"
      aria-hidden="true"
    >
      <path class={styles.track} d={arc(startAngle, startAngle + sweep)} />
      <path class={styles.detent} d={ticks(props.detents ?? 0)} />
      <path class={styles.value} d={props.fraction === undefined ? '' : arc(origin(), angle())} />
      <circle class={styles.cap} cx={center} cy={center} r={12.5} />
      <line
        class={styles.pointer}
        x1={center + Math.cos(radians(angle())) * 4}
        y1={center + Math.sin(radians(angle())) * 4}
        x2={center + Math.cos(radians(angle())) * 10.5}
        y2={center + Math.sin(radians(angle())) * 10.5}
      />
    </svg>
  );
}

/** The ring starts at 7:30 (135° clockwise from 3 o'clock) and sweeps 270° to 4:30. */
const startAngle = 135;
const sweep = 270;
const center = 22;
const radius = 18;

/** An SVG arc along the ring between two angles in degrees clockwise from 3 o'clock; empty when they meet. */
function arc(from: number, to: number) {
  if (Math.abs(to - from) < 0.5) {
    return '';
  }

  const [a, b] = from < to ? [from, to] : [to, from];
  const x0 = center + Math.cos(radians(a)) * radius;
  const y0 = center + Math.sin(radians(a)) * radius;
  const x1 = center + Math.cos(radians(b)) * radius;
  const y1 = center + Math.sin(radians(b)) * radius;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${radius} ${radius} 0 ${b - a > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** Short radial ticks just outside the ring at each of `count` stops. */
function ticks(count: number) {
  if (count < 2) {
    return '';
  }

  return Array.from({ length: count }, (_, index) => {
    const angle = radians(startAngle + (sweep * index) / (count - 1));
    const point = (distance: number) =>
      `${(center + Math.cos(angle) * distance).toFixed(2)} ${(center + Math.sin(angle) * distance).toFixed(2)}`;
    return `M${point(radius + 3.5)}L${point(radius + 6)}`;
  }).join('');
}

function radians(degrees: number) {
  return (degrees * Math.PI) / 180;
}
