import type { Point } from '@app-game/paint-core/camera';
import type { PaintCommand, SelectionAction, SelectionEvent } from '@app-game/paint-core/protocol';
import { pointInSelection, translateSelection } from '@app-game/paint-core/selection';
import { createSignal } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';

/**
 * Owns the transient selection outline, in document coordinates, and serializes pixel edits through the engine.
 * Dragging inside the outline moves the outline only, as in Photoshop's marquee; the transform moves the pixels.
 * Dragging outside replaces the outline with a new one of the chosen `shape`: drawn freehand (`lasso`), or spanned
 * from where the drag starts to where it is (`rectangle`, `ellipse`, aligned to the document). One selection edit runs
 * at a time: `busy` stays true until the engine replies through `receive`.
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
  const [shape, setShape] = createSignal<SelectionShape>('lasso');
  /** The pointer gesture in progress; `previous`/`original` restore the outline when it is cancelled. */
  let gesture:
    | { kind: 'lasso'; previous: Point[] }
    | { kind: 'rectangle' | 'ellipse'; start: Point; previous: Point[] }
    | { kind: 'move'; start: Point; original: Point[] }
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
    /** The shape a new outline is drawn with. */
    shape,
    setShape,
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
    /** Starts moving the outline when `point` is inside it, otherwise starts a new outline of the chosen shape. */
    begin(point: Point) {
      if (isBusy()) {
        return;
      }

      if (pointInSelection(point, outline())) {
        gesture = { kind: 'move', start: point, original: outline() };
      } else if (shape() === 'lasso') {
        gesture = { kind: 'lasso', previous: outline() };
        setPoints([point]);
      } else {
        gesture = { kind: shape() as 'rectangle' | 'ellipse', start: point, previous: outline() };
        setPoints([]);
      }

      setDrawing(true);
    },
    /** Continues the gesture: drags the outline by the offset from its start, or extends the lasso to `point`. */
    move(point: Point) {
      if (!gesture) {
        return;
      }

      if (gesture.kind === 'move') {
        setPoints(translateSelection(gesture.original, { x: point.x - gesture.start.x, y: point.y - gesture.start.y }));
        return;
      }

      if (gesture.kind !== 'lasso') {
        setPoints(spannedShape(gesture.kind, gesture.start, point));
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
    /** Keeps a moved outline, or closes the lasso; an outline needs at least three points. */
    end() {
      const finished = gesture;
      gesture = undefined;
      setDrawing(false);
      if (finished?.kind !== 'move' && enclosedArea(outline()) < minimumArea) {
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
  function action(kind: SelectionAction) {
    if (isBusy() || gesture || !options.ready() || (kind !== 'paste' && outline().length < 3)) {
      return;
    }

    setBusy(true);
    const { activeId, revision } = options.document();
    options.send({ type: 'selection', action: kind, points: outline(), layerId: activeId, revision });
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

/** How a new outline is drawn: freehand, or spanned as an axis-aligned rectangle or ellipse. */
export type SelectionShape = 'lasso' | 'rectangle' | 'ellipse';

/**
 * The outline of a rectangle or ellipse spanned from `start` to `end`, in document pixels, axis-aligned in the
 * document. Its box is rounded to whole pixels, so a rectangle selects whole pixels, as Photoshop's marquee; an
 * ellipse has 96 points.
 */
export function spannedShape(kind: 'rectangle' | 'ellipse', start: Point, end: Point): Point[] {
  const left = Math.round(Math.min(start.x, end.x)),
    right = Math.round(Math.max(start.x, end.x)),
    top = Math.round(Math.min(start.y, end.y)),
    bottom = Math.round(Math.max(start.y, end.y));
  if (kind === 'rectangle') {
    return [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom }
    ];
  }

  const center = { x: (left + right) / 2, y: (top + bottom) / 2 };
  return Array.from({ length: ellipsePoints }, (_, index) => {
    const angle = (index / ellipsePoints) * Math.PI * 2;
    return {
      x: center.x + ((right - left) / 2) * Math.cos(angle),
      y: center.y + ((bottom - top) / 2) * Math.sin(angle)
    };
  });
}

/** Points along an ellipse's outline; enough for a smooth edge at ordinary sizes. */
const ellipsePoints = 96;

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
