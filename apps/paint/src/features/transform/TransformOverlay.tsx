import type { Point, ViewSize } from '@app-game/paint-core/camera';
import { createSignal, For, onCleanup, Show } from 'solid-js';
import { placeBeside } from '../../shared/ui/placeBeside';
import styles from './Transform.module.css';
import { TransformActions } from './TransformActions';
import { TransformNumbers } from './TransformNumbers';
import type { BoxState, TransformSettings } from './createTransform';
import { boxPoints, distortBox, handles, moveBox, rotateBox, scaleBox, type BoxHandle } from './transformDrag';
import type { TransformBounds } from './transformEdit';

/**
 * The transform box over the canvas, with its actions next to it: drag inside to move, drag a corner or edge handle to
 * scale from the opposite handle, and drag the round handle to rotate about the center (Shift snaps to 15°). Corner
 * handles keep the proportions as the settings say; Shift does the opposite. A distorted box moves its corners on their
 * own instead, and its edge handles the two corners of their edge. Pen, mouse and touch all drag; touches
 * elsewhere keep navigating the canvas. A drag follows the pointer over the whole window until it is released. While
 * the box is moved, only the pixels show; while any part is dragged, the actions are hidden.
 */
export function TransformOverlay(props: {
  bounds: TransformBounds;
  box: BoxState;
  settings: TransformSettings;
  /** Size of the overlay, which covers the canvas, in CSS pixels. */
  size: ViewSize;
  /** Document point to CSS pixels of the overlay. */
  toScreen: (point: Point) => Point;
  /** CSS pixels of the overlay to a document point. */
  toDocument: (point: Point) => Point;
  onChange: (box: BoxState) => void;
  onSettings: (patch: Partial<TransformSettings>) => void;
  onFlip: (axis: 'x' | 'y') => void;
  onRotate: () => void;
  /** Turns distorting by the corners on or off; see `Transform.distort`. */
  onDistort: (on: boolean) => void;
  onReset: () => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  let svg!: SVGSVGElement;
  /** Removes the window listeners of the drag in progress. */
  let release: (() => void) | undefined;
  /** What the drag in progress changes. */
  const [dragging, setDragging] = createSignal<'move' | 'rotate' | BoxHandle>();
  const [numbers, setNumbers] = createSignal(false);
  onCleanup(() => release?.());
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
  /** Where the exact values go: below the actions, or above them near the bottom of the view. */
  const numbersAt = () => {
    const actions = actionsAt();
    const below = actions.top + actionsSize.height + 6;
    return {
      left: actions.left,
      top: below + numbersHeight <= props.size.height ? below : actions.top - numbersHeight - 6
    };
  };
  /** Where the actions go: next to the box and its rotation handle. */
  const actionsAt = () => {
    const { corners, rotation } = screen();
    return placeBeside([...corners, rotation], props.size, actionsSize);
  };
  const local = (event: PointerEvent) => {
    const rect = svg.getBoundingClientRect();
    return props.toDocument({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };
  /** Starts dragging `kind`; the drag follows the pointer until it is released or cancelled. */
  const begin = (kind: 'move' | 'rotate' | BoxHandle) => (event: PointerEvent) => {
    if (event.button !== 0 || release) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const id = event.pointerId;
    const start = { box: props.box, at: local(event) };
    const move = (moved: PointerEvent) => {
      if (moved.pointerId !== id) {
        return;
      }

      const pointer = local(moved);
      if (kind === 'move') {
        props.onChange(moveBox(start.box, start.at, pointer));
      } else if (kind === 'rotate') {
        props.onChange(rotateBox(props.bounds, start.box, start.at, pointer, moved.shiftKey));
      } else if (start.box.corners) {
        props.onChange(distortBox({ ...start.box, corners: start.box.corners }, kind, start.at, pointer));
      } else {
        const free = props.settings.proportional === moved.shiftKey;
        props.onChange(scaleBox(props.bounds, start.box, kind, pointer, free));
      }
    };
    const end = (ended: PointerEvent) => {
      if (ended.pointerId === id) {
        release?.();
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    setDragging(kind);
    release = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      setDragging(undefined);
      release = undefined;
    };
  };

  return (
    <div class={styles.layer}>
      <svg
        ref={svg}
        class={styles.overlay}
        aria-label="Transform box"
        data-moving={dragging() === 'move' ? 'true' : 'false'}
      >
        <polygon
          class={styles.body}
          points={screen()
            .corners.map(({ x, y }) => `${x},${y}`)
            .join(' ')}
          onPointerDown={begin('move')}
        />
        <line
          class={styles.stem}
          x1={screen().top.x}
          y1={screen().top.y}
          x2={screen().rotation.x}
          y2={screen().rotation.y}
        />
        {/* A fixed list keeps each handle's element while the box changes. */}
        <For each={handles}>
          {(handle, index) => (
            <rect
              class={styles.handle}
              x={screen().handles[index()]!.x - 7}
              y={screen().handles[index()]!.y - 7}
              width={14}
              height={14}
              aria-label="Scale handle"
              onPointerDown={begin(handle)}
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
        />
      </svg>
      <Show when={!dragging()}>
        <TransformActions
          placement={actionsAt()}
          settings={props.settings}
          onSettings={props.onSettings}
          onFlip={props.onFlip}
          onRotate={props.onRotate}
          distorted={props.box.corners !== undefined}
          onDistort={props.onDistort}
          numbers={numbers()}
          onNumbers={setNumbers}
          onReset={props.onReset}
          onCancel={props.onCancel}
          onDone={props.onDone}
        />
        <Show when={numbers()}>
          <TransformNumbers
            placement={numbersAt()}
            box={props.box}
            settings={props.settings}
            onChange={props.onChange}
          />
        </Show>
      </Show>
    </div>
  );
}

/** Approximate height of the exact values, for placing them. */
const numbersHeight = 44;

/** Approximate size of the actions, for placing them. */
const actionsSize = { width: 480, height: 48 };
