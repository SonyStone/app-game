import type { Point } from '@app-game/paint-core/camera';
import type { PaintCommand, SelectionAction, SelectionEvent } from '@app-game/paint-core/protocol';
import { pointInSelection, translateSelection } from '@app-game/paint-core/selection';
import { createSignal, latest } from 'solid-js';

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
  const [points, setPoints] = createSignal<Point[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [drawing, setDrawing] = createSignal(false);
  const [hasClipboard, setHasClipboard] = createSignal(false);
  /** The pointer gesture in progress; `previous`/`original` restore the outline when it is cancelled. */
  let gesture:
    | { kind: 'lasso'; previous: Point[] }
    | { kind: 'move'; start: Point; original: Point[]; offset: Point }
    | undefined;
  /** Outline including changes made earlier in the current event. */
  const outline = () => latest(points);

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
    isBusy: () => latest(busy),
    action,
    /** Cancels a gesture and removes the outline, unless an edit is still applying. */
    clear() {
      cancel();
      if (!latest(busy)) {
        setPoints([]);
      }
    },
    cancel,
    /** Starts moving the outline when `point` is inside it, otherwise starts a new lasso. */
    begin(point: Point) {
      if (latest(busy)) {
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
          if (latest(busy)) {
            setPoints(translateSelection(finished.original, finished.offset));
          }
        }
      } else if (outline().length < 3) {
        setPoints([]);
      }
    },
    /** Applies the engine's outline and clipboard state after an edit, or a reset when the engine is replaced. */
    receive(event: SelectionEvent) {
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
    if (latest(busy) || gesture || !options.ready() || (kind !== 'paste' && outline().length < 3)) {
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
