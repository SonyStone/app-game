import type { Point, ViewSize } from '@app-game/paint-core/camera';
import { createSignal, For, onCleanup, Show } from 'solid-js';
import { placeBeside } from '../../shared/ui/placeBeside';
import styles from './Transform.module.css';
import { TransformActions } from './TransformActions';
import { TransformNumbers } from './TransformNumbers';
import type { BoxState, TransformSettings } from './createTransform';
import {
  bendBox,
  boxPoints,
  distortBox,
  handles,
  moveBox,
  movePivot,
  moveWarpPoint,
  rotateBox,
  scaleBox,
  type BoxHandle
} from './transformDrag';
import type { TransformBounds } from './transformEdit';
import { locateOnWarp, warpCells, warpOutline, warpSide } from './warp';

/**
 * The transform box over the canvas, with its actions next to it: drag inside to move, drag a corner or edge handle to
 * scale from the opposite handle, and drag the round handle to rotate about the center (Shift snaps to 15°). Corner
 * handles keep the proportions as the settings say; Shift does the opposite. A distorted box moves its corners on their
 * own instead, and its edge handles the two corners of their edge. A warped box shows its 16 control points over a
 * grid of the bent surface instead: drag a point to bend it, a corner to move it with its edges, inside to move it. The crosshair is the pivot that turns and exact
 * sizes go about; dragging it moves the pivot, not the pixels. Pen, mouse and touch all drag; touches
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
  /** Turns warping by a grid of points on or off; see `Transform.warp`. */
  onWarp: (on: boolean) => void;
  /** Changes the warp's patches per side; see `Transform.warpGrid`. */
  onWarpGrid: (cells: number) => void;
  onReset: () => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  let svg!: SVGSVGElement;
  /** Removes the window listeners of the drag in progress. */
  let release: (() => void) | undefined;
  /** What the drag in progress changes. */
  const [dragging, setDragging] = createSignal<DragKind>();
  const [numbers, setNumbers] = createSignal(false);
  onCleanup(() => release?.());
  const points = () => boxPoints(props.bounds, props.box, props.settings);
  const screen = () => {
    const current = points();
    const corners = current.corners.map(props.toScreen);
    const center = props.toScreen(current.center);
    // The rotation handle sits outside the top edge, away from the center on screen.
    const top = props.toScreen(current.handles[1]!.point);
    const length = Math.hypot(top.x - center.x, top.y - center.y) || 1;
    const rotation = { x: top.x + ((top.x - center.x) / length) * 32, y: top.y + ((top.y - center.y) / length) * 32 };
    return {
      corners,
      top,
      rotation,
      pivot: props.toScreen(current.pivot),
      handles: current.handles.map(({ point }) => props.toScreen(point))
    };
  };
  /** The warp's outline, grid lines and control points on screen, for a warped box. */
  const warpScreen = () => {
    const warp = props.box.warp;
    if (!warp) {
      return undefined;
    }

    const { outline, lines } = warpOutline(warp);
    const path = (points: Point[]) =>
      points
        .map((point, index) => `${index ? 'L' : 'M'} ${props.toScreen(point).x} ${props.toScreen(point).y}`)
        .join(' ');
    const points = warp.map(props.toScreen);
    // Stems from each anchor, where patches meet, to the handle points beside it.
    const side = warpSide(warp);
    const stems = warp.flatMap((anchor, index) => {
      const column = index % side,
        row = Math.floor(index / side);
      if (column % 3 || row % 3) {
        return [];
      }

      return [
        [column - 1, row],
        [column + 1, row],
        [column, row - 1],
        [column, row + 1]
      ]
        .filter(([x, y]) => x! >= 0 && x! < side && y! >= 0 && y! < side)
        .map(([x, y]) => [anchor, warp[y! * side + x!]!]);
    });
    return {
      outline: `${path(outline)} Z`,
      lines: lines.map(path).join(' '),
      net: stems.map(path).join(' '),
      side,
      points,
      bounds: outline.map(props.toScreen)
    };
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
    const warped = warpScreen();
    if (warped) {
      return placeBeside(warped.bounds, props.size, actionsSize);
    }

    const { corners, rotation } = screen();
    return placeBeside([...corners, rotation], props.size, actionsSize);
  };
  const local = (event: PointerEvent) => {
    const rect = svg.getBoundingClientRect();
    return props.toDocument({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };
  /** Bends the warp where it is pressed, or moves it all when pressed off its surface. */
  const beginBend = (event: PointerEvent) => {
    const at = props.box.warp && locateOnWarp(props.box.warp, local(event));
    begin(at ? { bend: at } : 'move')(event);
  };
  /** Starts dragging `kind`; the drag follows the pointer until it is released or cancelled. */
  const begin = (kind: DragKind) => (event: PointerEvent) => {
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
      } else if (kind === 'pivot') {
        props.onChange(movePivot(props.bounds, start.box, pointer));
      } else if (kind === 'rotate') {
        props.onChange(rotateBox(props.bounds, start.box, start.at, pointer, moved.shiftKey));
      } else if ('warp' in kind) {
        if (start.box.warp) {
          props.onChange(moveWarpPoint({ ...start.box, warp: start.box.warp }, kind.warp, start.at, pointer));
        }
      } else if ('bend' in kind) {
        if (start.box.warp) {
          props.onChange(bendBox({ ...start.box, warp: start.box.warp }, kind.bend, start.at, pointer));
        }
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
        data-moving={hidesBox(dragging()) ? 'true' : 'false'}
      >
        <Show when={warpScreen()}>
          {(warped) => (
            <>
              <path class={styles.body} d={warped().outline} onPointerDown={beginBend} />
              <path class={styles.warpLines} d={warped().lines} />
              <path class={styles.warpNet} d={warped().net} />
              {/* Rows by position keep each point's element while the warp changes; anchors are larger. */}
              <For each={warpIndices(warped().side)}>
                {(index) => (
                  <circle
                    class={styles.handle}
                    cx={warped().points[index]!.x}
                    cy={warped().points[index]!.y}
                    r={isAnchor(index, warped().side) ? 7 : 5}
                    aria-label="Warp point"
                    onPointerDown={begin({ warp: index })}
                  />
                )}
              </For>
            </>
          )}
        </Show>
        <Show when={!props.box.warp}>
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
          <Show when={!props.box.corners}>
            <g class={styles.pivot} aria-label="Pivot" role="slider" onPointerDown={begin('pivot')}>
              <circle cx={screen().pivot.x} cy={screen().pivot.y} r={9} />
              <path
                d={`M ${screen().pivot.x - 5} ${screen().pivot.y} h 10 M ${screen().pivot.x} ${screen().pivot.y - 5} v 10`}
              />
            </g>
          </Show>
          <circle
            class={styles.rotate}
            cx={screen().rotation.x}
            cy={screen().rotation.y}
            r={9}
            aria-label="Rotate handle"
            onPointerDown={begin('rotate')}
          />
        </Show>
      </svg>
      <Show when={!dragging()}>
        <TransformActions
          placement={actionsAt()}
          settings={props.settings}
          onSettings={props.onSettings}
          onFlip={props.onFlip}
          onRotate={props.onRotate}
          distorted={props.box.corners !== undefined && !props.box.warp}
          perspective={props.settings.perspective}
          onDistort={props.onDistort}
          warped={props.box.warp !== undefined}
          onWarp={props.onWarp}
          warpCells={props.box.warp ? warpCells(props.box.warp) : 1}
          onWarpGrid={props.onWarpGrid}
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

/**
 * What a drag changes: the whole box, its rotation, its pivot, a box handle, a warp control point, or the warp's
 * surface at a point `bend` (`u`, `v` from 0 to 1).
 */
type DragKind = 'move' | 'rotate' | 'pivot' | BoxHandle | { warp: number } | { bend: Point };

/**
 * Whether a drag hides the box so that only the pixels show: moving, turning, scaling and distorting do; moving the
 * pivot and bending a warp keep their guides in view.
 */
function hidesBox(kind: DragKind | undefined) {
  return kind !== undefined && kind !== 'pivot' && !(typeof kind === 'object' && ('warp' in kind || 'bend' in kind));
}

/** Indices of the control points of a warp with `side` points per side. */
function warpIndices(side: number) {
  return Array.from({ length: side * side }, (_, index) => index);
}

/** Whether control point `index` is an anchor, where patches meet. */
function isAnchor(index: number, side: number) {
  return (index % side) % 3 === 0 && Math.floor(index / side) % 3 === 0;
}

/** Approximate height of the exact values, for placing them. */
const numbersHeight = 44;

/** Approximate size of the actions, for placing them. */
const actionsSize = { width: 480, height: 48 };
