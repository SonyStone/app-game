import type { Point } from '@app-game/paint-core/camera';
import { For } from 'solid-js';
import styles from './Gradient.module.css';
import type { GradientCommand } from './gradientEdit';

/**
 * A preview of the gradient being dragged, drawn over the canvas with CSS gradients in the same color space (Smooth
 * color as `srgb-linear`) and clipped to the selection, with the drag's line and ends. An angle gradient is a conic
 * gradient, a diamond four linear ones, one per quarter around the start. It covers the layers instead of blending
 * into the active one, so the result can differ where the layer has paint or a blend mode.
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
  const clip = () =>
    props.command.points &&
    `polygon(${props.command.points
      .map(props.toScreen)
      .map(({ x, y }) => `${x}px ${y}px`)
      .join(', ')})`;

  return (
    <div class={styles.preview} aria-hidden="true">
      <div class={styles.fill} style={{ opacity: props.command.opacity, 'clip-path': clip() }}>
        <For each={shapes(props.command, start(), end(), props.size, mirrored(props.toScreen, props.command.start))}>
          {(shape) => <div class={styles.shape} style={{ background: shape.background, 'clip-path': shape.clip }} />}
        </For>
      </div>
      <svg class={styles.line}>
        <line x1={start().x} y1={start().y} x2={end().x} y2={end().y} />
        <circle cx={start().x} cy={start().y} r={5} />
        <circle cx={end().x} cy={end().y} r={5} />
      </svg>
    </div>
  );
}

/**
 * CSS backgrounds that draw the gradient from screen point `a` to `b` on a canvas of `size`, each with an optional
 * clip. `mirrored` says the view shows the document mirrored, which turns an angle gradient the other way on screen.
 */
function shapes(
  command: GradientCommand,
  a: Point,
  b: Point,
  size: { width: number; height: number },
  mirrored: boolean
): { background: string; clip?: string }[] {
  const space = command.mixing === 'linear' ? 'srgb-linear' : 'srgb';
  const repeating = command.repeat === 'none' ? '' : 'repeating-';
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  if (command.kind === 'radial') {
    const stops = cssStops(command, 0, length, 'px');
    return [
      { background: `${repeating}radial-gradient(in ${space} circle ${length}px at ${a.x}px ${a.y}px, ${stops})` }
    ];
  }

  if (command.kind === 'angle') {
    // CSS turns clockwise from up; the gradient starts at the drag's direction and never repeats within a turn.
    const from = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90;
    const stops = cssStops({ ...command, repeat: 'none' }, mirrored ? 360 : 0, mirrored ? 0 : 360, 'deg');
    return [{ background: `conic-gradient(in ${space} from ${from}deg at ${a.x}px ${a.y}px, ${stops})` }];
  }

  if (command.kind === 'linear') {
    return [{ background: linear(command, a, b, size, space, repeating) }];
  }

  // A diamond is linear in each quarter around the start, towards that quarter's edge of the square.
  const u = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  const v = { x: -u.y, y: u.x };
  const far = 2 * (size.width + size.height);
  const at = (su: number, sv: number, distance: number) => ({
    x: a.x + (su * u.x + sv * v.x) * distance,
    y: a.y + (su * u.y + sv * v.y) * distance
  });
  return [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1]
  ].map(([su, sv]) => ({
    background: linear(command, a, at(su! / 2, sv! / 2, length), size, space, repeating),
    clip: `polygon(${[a, at(su!, 0, far), at(su!, sv!, far), at(0, sv!, far)]
      .map(({ x, y }) => `${x}px ${y}px`)
      .join(', ')})`
  }));
}

/** A CSS linear gradient from screen point `a` to `b` on a canvas of `size`. */
function linear(
  command: GradientCommand,
  a: Point,
  b: Point,
  size: { width: number; height: number },
  space: string,
  repeating: string
) {
  // CSS places a gradient on a line through the box's center; stops are distances along it from its start.
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const direction = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  const line = Math.abs(size.width * direction.x) + Math.abs(size.height * direction.y);
  const origin = { x: size.width / 2 - (direction.x * line) / 2, y: size.height / 2 - (direction.y * line) / 2 };
  const along = (point: Point) => (point.x - origin.x) * direction.x + (point.y - origin.y) * direction.y;
  const angle = (Math.atan2(direction.x, -direction.y) * 180) / Math.PI;
  return `${repeating}linear-gradient(in ${space} ${angle}deg, ${cssStops(command, along(a), along(b), 'px')})`;
}

/**
 * CSS color stops for the gradient's positions 0 to 1 at `from` to `to`, in `unit`, which may run backwards. The ends
 * get stops of their own, so a repeating gradient repeats the whole span; a reflected one adds the way back.
 */
function cssStops(command: GradientCommand, from: number, to: number, unit: string) {
  const sorted = [...command.stops].sort((a, b) => a.position - b.position);
  const ends = [{ ...sorted[0]!, position: 0 }, ...sorted, { ...sorted.at(-1)!, position: 1 }];
  const stops = ends.map((stop) => ({ ...stop, at: from + (to - from) * stop.position }));
  if (command.repeat === 'reflect') {
    stops.push(...[...ends].reverse().map((stop) => ({ ...stop, at: from + (to - from) * (2 - stop.position) })));
  }

  // CSS needs stops in increasing order.
  if (to < from) {
    stops.reverse();
  }

  return stops
    .map(
      ({ color, alpha, at }) =>
        `${color}${Math.round(alpha * 255)
          .toString(16)
          .padStart(2, '0')} ${at}${unit}`
    )
    .join(', ');
}

/** Whether `toScreen` mirrors the document: its x and y axes then turn the other way round on screen. */
function mirrored(toScreen: (point: Point) => Point, at: Point) {
  const origin = toScreen(at),
    x = toScreen({ x: at.x + 1, y: at.y }),
    y = toScreen({ x: at.x, y: at.y + 1 });
  return (x.x - origin.x) * (y.y - origin.y) - (x.y - origin.y) * (y.x - origin.x) < 0;
}
