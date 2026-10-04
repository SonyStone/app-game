import type { Point, ViewSize } from '@app-game/paint-core/camera';
import type { DocumentRect } from '@app-game/paint-core/layersInView';
import { createSignal, For, onCleanup } from 'solid-js';
import { FloatingBar, floatingBarPrimary } from '../../shared/ui/FloatingBar';
import { placeBeside } from '../../shared/ui/placeBeside';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './Frames.module.css';
import type { Frame } from './framesFeature';

/**
 * Handles for changing a frame's rectangle on the canvas: drag a corner or an edge to resize it, or inside to move
 * it. The outline follows the drag and the frame changes once, on release, so a drag is one change of the document.
 * Pen, mouse and touch all drag, and a drag follows the pointer over the whole window. Done, next to the frame, ends
 * adjusting.
 */
export function FrameEditor(props: {
  frame: Frame;
  /** Document point to CSS pixels of the canvas. */
  toScreen: (point: Point) => Point;
  /** CSS pixels of the canvas to a document point. */
  toDocument: (point: Point) => Point;
  /** Receives the frame's new rectangle when a drag ends. */
  onChange: (rect: DocumentRect) => void;
  /** Canvas size in CSS pixels, for placing Done. */
  size: ViewSize;
  onDone: () => void;
}) {
  let svg!: SVGSVGElement;
  const [draft, setDraft] = createSignal<DocumentRect>();
  const rect = () => draft() ?? props.frame;
  /** Removes the window listeners of the drag in progress. */
  let release: (() => void) | undefined;
  onCleanup(() => release?.());

  const at = (handle: RectHandle) => {
    const { left, top, width, height } = rect();
    return props.toScreen({ x: left + ((handle.x + 1) / 2) * width, y: top + ((handle.y + 1) / 2) * height });
  };
  const local = (event: PointerEvent) => {
    const box = svg.getBoundingClientRect();
    return props.toDocument({ x: event.clientX - box.left, y: event.clientY - box.top });
  };
  const begin = (handle: RectHandle | 'move') => (event: PointerEvent) => {
    if (event.button !== 0 || release) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const id = event.pointerId,
      start = local(event),
      from = rect();
    const move = (moved: PointerEvent) => {
      if (moved.pointerId === id) {
        const pointer = local(moved);
        setDraft(resizeRect(from, handle, { x: pointer.x - start.x, y: pointer.y - start.y }));
      }
    };
    const end = (ended: PointerEvent) => {
      if (ended.pointerId !== id) {
        return;
      }

      const changed = draft();
      release?.();
      if (changed && ended.type === 'pointerup') {
        props.onChange(changed);
      }

      setDraft(undefined);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    release = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      release = undefined;
    };
  };

  return (
    <>
      <svg ref={svg} class={styles.editor} aria-label="Frame handles">
        <polygon
          class={styles.editorBody}
          points={corners.map((corner) => `${at(corner).x},${at(corner).y}`).join(' ')}
          onPointerDown={begin('move')}
        />
        <For each={handles}>
          {(handle) => (
            <circle
              class={styles.editorHandle}
              cx={at(handle).x}
              cy={at(handle).y}
              r={8}
              aria-label="Resize frame"
              onPointerDown={begin(handle)}
            />
          )}
        </For>
      </svg>
      <FloatingBar
        placement={placeBeside(corners.map(at), props.size, { width: 60, height: 48 })}
        label="Frame actions"
      >
        <button
          class={floatingBarPrimary}
          aria-label="Done adjusting the frame"
          title="Done"
          onClick={() => props.onDone()}
        >
          <SketchIcon name="check" size={20} />
        </button>
      </FloatingBar>
    </>
  );
}

/** A handle on a rectangle: -1, 0 or 1 per axis, from the left/top edge through the middle to the right/bottom. */
export type RectHandle = { x: -1 | 0 | 1; y: -1 | 0 | 1 };

/**
 * A rectangle after `handle` moves by `delta`, or after it is moved whole for `move`. Edges dragged past each other
 * swap, so the rectangle never turns inside out.
 */
export function resizeRect(rect: DocumentRect, handle: RectHandle | 'move', delta: Point): DocumentRect {
  if (handle === 'move') {
    return { ...rect, left: rect.left + delta.x, top: rect.top + delta.y };
  }

  let left = rect.left,
    right = rect.left + rect.width,
    top = rect.top,
    bottom = rect.top + rect.height;
  if (handle.x < 0) {
    left += delta.x;
  } else if (handle.x > 0) {
    right += delta.x;
  }

  if (handle.y < 0) {
    top += delta.y;
  } else if (handle.y > 0) {
    bottom += delta.y;
  }

  return {
    left: Math.min(left, right),
    top: Math.min(top, bottom),
    width: Math.abs(right - left),
    height: Math.abs(bottom - top)
  };
}

/** Corners clockwise from the top-left, for the outline. */
const corners: readonly RectHandle[] = [
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 }
];

/** Corner and edge handles, clockwise from the top-left corner. */
const handles: readonly RectHandle[] = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 }
];
