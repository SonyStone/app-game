import type { Point } from '@app-game/paint-core/camera';
import { For } from 'solid-js';
import type { BoxState } from './createTransform';
import styles from './Transform.module.css';
import { boxPoints, moveBox, rotateBox, scaleBox, type BoxHandle } from './transformDrag';
import type { TransformBounds } from './transformEdit';

/**
 * The transform box over the canvas: drag inside to move, drag a corner or edge handle to scale from the opposite
 * handle (Shift scales corners freely), and drag the round handle to rotate about the center (Shift snaps to 15°).
 * Pen, mouse and touch all drag; touches elsewhere keep navigating the canvas.
 */
export function TransformOverlay(props: {
  bounds: TransformBounds;
  box: BoxState;
  /** Document point to CSS pixels of the overlay, which covers the canvas. */
  toScreen: (point: Point) => Point;
  /** CSS pixels of the overlay to a document point. */
  toDocument: (point: Point) => Point;
  onChange: (box: BoxState) => void;
}) {
  let svg!: SVGSVGElement;
  /** The drag in progress, with the box and document point where it began. */
  let drag: { kind: 'move' | 'rotate' | BoxHandle; box: BoxState; start: Point } | undefined;
  const points = () => boxPoints(props.bounds, props.box);
  const screen = () => {
    const current = points();
    const corners = current.corners.map(props.toScreen);
    const center = props.toScreen(current.center);
    // The rotation handle sits outside the top edge, away from the center on screen.
    const top = props.toScreen(current.handles[1]!.point);
    const length = Math.hypot(top.x - center.x, top.y - center.y) || 1;
    const rotation = { x: top.x + ((top.x - center.x) / length) * 32, y: top.y + ((top.y - center.y) / length) * 32 };
    return { corners, top, rotation, handles: current.handles.map(({ point }) => props.toScreen(point)) };
  };
  const local = (event: PointerEvent) => {
    const rect = svg.getBoundingClientRect();
    return props.toDocument({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };
  const begin = (kind: NonNullable<typeof drag>['kind']) => (event: PointerEvent) => {
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    drag = { kind, box: props.box, start: local(event) };
  };
  const move = (event: PointerEvent) => {
    if (!drag) {
      return;
    }

    const pointer = local(event);
    if (drag.kind === 'move') {
      props.onChange(moveBox(drag.box, drag.start, pointer));
    } else if (drag.kind === 'rotate') {
      props.onChange(rotateBox(props.bounds, drag.box, drag.start, pointer, event.shiftKey));
    } else {
      props.onChange(scaleBox(props.bounds, drag.box, drag.kind, pointer, event.shiftKey));
    }
  };
  const end = () => {
    drag = undefined;
  };

  return (
    <svg ref={svg} class={styles.overlay} aria-label="Transform box">
      <polygon
        class={styles.body}
        points={screen()
          .corners.map(({ x, y }) => `${x},${y}`)
          .join(' ')}
        onPointerDown={begin('move')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <line
        class={styles.stem}
        x1={screen().top.x}
        y1={screen().top.y}
        x2={screen().rotation.x}
        y2={screen().rotation.y}
      />
      <For each={screen().handles}>
        {(point, index) => (
          <rect
            class={styles.handle}
            x={point.x - 7}
            y={point.y - 7}
            width={14}
            height={14}
            aria-label="Scale handle"
            onPointerDown={begin(boxPoints(props.bounds, props.box).handles[index()]!.handle)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
        )}
      </For>
      <circle
        class={styles.rotate}
        cx={screen().rotation.x}
        cy={screen().rotation.y}
        r={9}
        aria-label="Rotate handle"
        onPointerDown={begin('rotate')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
    </svg>
  );
}
