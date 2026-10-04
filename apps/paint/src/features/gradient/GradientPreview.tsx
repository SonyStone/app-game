import type { Point } from '@app-game/paint-core/camera';
import styles from './Gradient.module.css';
import type { GradientCommand } from './gradientEdit';

/**
 * A preview of the gradient being dragged, drawn over the canvas with a CSS gradient in the same color space (Smooth
 * color as `srgb-linear`) and clipped to the selection, with the drag's line and ends. It covers the layers instead of
 * blending into the active one, so the result can differ where the layer has paint or a blend mode.
 */
export function GradientPreview(props: {
  command: GradientCommand;
  /** Document point to CSS pixels of the canvas. */
  toScreen: (point: Point) => Point;
  /** Canvas size in CSS pixels. */
  size: { width: number; height: number };
}) {
  const start = () => props.toScreen(props.command.start);
  const end = () => props.toScreen(props.command.end);
  const space = () => (props.command.mixing === 'linear' ? 'srgb-linear' : 'srgb');
  /** CSS color stops at distances `from` to `to` along the gradient, in pixels. */
  const stops = (from: number, to: number) =>
    [...props.command.stops]
      .sort((a, b) => a.position - b.position)
      .map(
        ({ position, color, alpha }) =>
          `${color}${Math.round(alpha * 255)
            .toString(16)
            .padStart(2, '0')} ${from + (to - from) * position}px`
      )
      .join(', ');
  const background = () => {
    const a = start(),
      b = end();
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    if (props.command.kind === 'radial') {
      return `radial-gradient(in ${space()} circle ${length}px at ${a.x}px ${a.y}px, ${stops(0, length)})`;
    }

    // CSS places a gradient on a line through the box's center; stops are distances along it from its start.
    const direction = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    const { width, height } = props.size;
    const line = Math.abs(width * direction.x) + Math.abs(height * direction.y);
    const origin = { x: width / 2 - (direction.x * line) / 2, y: height / 2 - (direction.y * line) / 2 };
    const along = (point: Point) => (point.x - origin.x) * direction.x + (point.y - origin.y) * direction.y;
    const angle = (Math.atan2(direction.x, -direction.y) * 180) / Math.PI;
    return `linear-gradient(in ${space()} ${angle}deg, ${stops(along(a), along(b))})`;
  };
  const clip = () =>
    props.command.points &&
    `polygon(${props.command.points
      .map(props.toScreen)
      .map(({ x, y }) => `${x}px ${y}px`)
      .join(', ')})`;

  return (
    <div class={styles.preview} aria-hidden="true">
      <div
        class={styles.fill}
        style={{ background: background(), opacity: props.command.opacity, 'clip-path': clip() }}
      />
      <svg class={styles.line}>
        <line x1={start().x} y1={start().y} x2={end().x} y2={end().y} />
        <circle cx={start().x} cy={start().y} r={5} />
        <circle cx={end().x} cy={end().y} r={5} />
      </svg>
    </div>
  );
}
