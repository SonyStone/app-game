import type { Point } from '@app-game/paint-core/camera';
import type { PaintCommand, SelectionAction, SelectionEvent } from '@app-game/paint-core/protocol';
import { pointInSelection, translateSelection } from '@app-game/paint-core/selection';
import { createSignal } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';

/**
 * Owns the transient lasso outline, in document coordinates, and serializes pixel edits through the engine.
 * Dragging inside the outline moves it; dragging outside replaces it. Pixels move when the pointer is released.
 * One selection edit runs at a time: `busy` stays true until the engine replies through `receive`.
 */
export function createSelection(options: {
  send: (command: Extract<PaintCommand, { type: 'selection' }>) => void;
  /** Active layer and revision that a selection edit applies to. */
  document: () => { activeId: string; revision: number };
  ready: () => boolean;
}) {
  // `outline` and `isBusy` include changes made earlier in the current event.
  const [points, setPoints, outline] = createImmediateSignal<Point[]>([]);
  const [busy, setBusy, isBusy] = createImmediateSignal(false);
  const [drawing, setDrawing] = createSignal(false);
  const [hasClipboard, setHasClipboard] = createSignal(false);
  /** The pointer gesture in progress; `previous`/`original` restore the outline when it is cancelled. */
  let gesture:
    | { kind: 'lasso'; previous: Point[] }
    | { kind: 'move'; start: Point; original: Point[]; offset: Point }
    | undefined;

  return {
    /** Outline vertices; fewer than three means nothing is selected. */
    points,
    /** A selection edit is waiting for the engine. */
    busy,
    /** A lasso or move gesture is in progress. */
    drawing,
    /** The engine holds copied pixels that Paste can insert. */
    hasClipboard,
    /** Like `busy`, including an edit started earlier in the current event; for synchronous guards. */
    isBusy,
    action,
    /** Cancels a gesture and removes the outline, unless an edit is still applying. */
    clear() {
      cancel();
      if (!isBusy()) {
        setPoints([]);
      }
    },
    /** Ends a gesture without committing it, restoring the outline from before the gesture. */
    cancel,
    /** Replaces the outline, for example with one transformed together with its pixels; ignored while busy. */
    replace(next: Point[]) {
      cancel();
      if (!isBusy()) {
        setPoints(next);
      }
    },
    /** Starts moving the outline when `point` is inside it, otherwise starts a new lasso. */
    begin(point: Point) {
      if (isBusy()) {
        return;
      }

      if (pointInSelection(point, outline())) {
        gesture = { kind: 'move', start: point, original: outline(), offset: { x: 0, y: 0 } };
      } else {
        gesture = { kind: 'lasso', previous: outline() };
        setPoints([point]);
      }

      setDrawing(true);
    },
    /** Continues the gesture: drags the outline by the offset from its start, or extends the lasso to `point`. */
    move(point: Point) {
      if (!gesture) {
        return;
      }

      if (gesture.kind === 'move') {
        gesture.offset = { x: Math.round(point.x - gesture.start.x), y: Math.round(point.y - gesture.start.y) };
        setPoints(translateSelection(gesture.original, gesture.offset));
        return;
      }

      const path = outline();
      const last = path.at(-1)!;
      if (last.x === point.x && last.y === point.y) {
        return;
      }

      // Preserve a bounded path for long drags without truncating its endpoint.
      const sampled = path.length >= 4095 ? path.filter((_, index) => index % 2 === 0) : path;
      setPoints([...sampled, point]);
    },
    /** Commits a move as one undoable edit, or closes the lasso; an outline needs at least three points. */
    end() {
      const finished = gesture;
      gesture = undefined;
      setDrawing(false);
      if (finished?.kind === 'move') {
        setPoints(finished.original);
        if (finished.offset.x || finished.offset.y) {
          action('move', finished.offset);
          if (isBusy()) {
            setPoints(translateSelection(finished.original, finished.offset));
          }
        }
      } else if (enclosedArea(outline()) < minimumArea) {
        // Fewer than three points or a straight drag encloses no pixels to copy, cut or move.
        setPoints([]);
      }
    },
    /**
     * Applies the engine's outline and clipboard state after an edit, or a reset when the engine is replaced. Edits
     * never run during a gesture, so a gesture still in progress belonged to the replaced outline and ends here.
     */
    receive(event: SelectionEvent) {
      gesture = undefined;
      setDrawing(false);
      setBusy(false);
      setPoints(event.points);
      setHasClipboard(event.hasClipboard);
    }
  };

  /**
   * Sends one pixel edit for the current outline on the active layer. Ignored while another edit is applying, during
   * a gesture, before the engine is ready, or without an outline (except Paste).
   */
  function action(kind: SelectionAction, offset?: Point) {
    if (isBusy() || gesture || !options.ready() || (kind !== 'paste' && outline().length < 3)) {
      return;
    }

    setBusy(true);
    const { activeId, revision } = options.document();
    options.send({ type: 'selection', action: kind, points: outline(), offset, layerId: activeId, revision });
  }

  function cancel() {
    if (gesture) {
      setPoints(gesture.kind === 'move' ? gesture.original : gesture.previous);
    }

    gesture = undefined;
    setDrawing(false);
  }
}

/** The lasso state and commands used by the editor. */
export type Selection = ReturnType<typeof createSelection>;

/** Smallest outline area, in square document pixels, kept as a selection. */
const minimumArea = 1;

/** Absolute area of the closed polygon through `points` (shoelace formula); 0 for fewer than three points. */
function enclosedArea(points: readonly Point[]) {
  let twice = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    twice += a.x * b.y - b.x * a.y;
  }

  return Math.abs(twice) / 2;
}
