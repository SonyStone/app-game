import type { Point } from '@app-game/paint-core/camera';
import type { PaintCommand, SelectionAction, SelectionEvent } from '@app-game/paint-core/protocol';
import {
  emptySummary,
  hitsSelection,
  type SelectionMode,
  type SelectionPreview,
  type SelectionSummary
} from '@app-game/paint-core/selectionMask';
import type { Result } from 'neverthrow';
import { createSignal } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import type { PaintError } from '../../shared/errors';
import { selectionEdit, type SelectionCommand } from './selectionEdit';

/**
 * The UI half of the selection, whose engine half is `selectionEdit`: the engine owns the selection as a coverage mask
 * and reports its summary through `receive`; this factory owns the tools that change it and the commands on its pixels.
 *
 * With a shape tool, dragging outside the selection draws a new shape: freehand (`lasso`), spanned from where the drag
 * starts (`rectangle`, `ellipse`, aligned to the document) or, with `polygon`, one corner per press, closed by pressing
 * the first corner again, a double press or `finish`. The shape combines with the selection by `mode`, or by the keys
 * held at the press: Shift adds, Alt/Option subtracts, both intersect. Dragging inside the selection without them moves
 * the outline only, as in Photoshop's marquee; the transform moves the pixels. The `wand` selects similar colors where
 * it is pressed. `preview` shows a gesture until the engine applies it.
 *
 * One selection change or pixel command runs at a time: `busy` stays true until the engine replies. Must be created
 * within a Solid owner.
 */
export function createSelection(options: {
  /** Sends a pixel command on the selection; the engine answers with a selection event. */
  send: (command: Extract<PaintCommand, { type: 'selection' }>) => void;
  /** Runs a selection change and resolves when the engine has applied it; see `PaintEngine.runEdit`. */
  run: (command: Extract<PaintCommand, { type: 'edit' }>) => Promise<Result<unknown, PaintError>>;
  /** Active layer and revision that a pixel command applies to. */
  document: () => { activeId: string; revision: number };
  ready: () => boolean;
  /** The view's bounds in document pixels, which bound what the magic wand reaches. */
  area: () => { left: number; top: number; width: number; height: number };
  /** Document pixels within which a press closes a polygon at its first corner. */
  closeDistance: () => number;
  onError: (error: PaintError) => void;
}) {
  const [summary, setSummary, currentSummary] = createImmediateSignal<SelectionSummary>(emptySummary);
  // `isBusy` includes changes made earlier in the current event.
  const [busy, setBusy, isBusy] = createImmediateSignal(false);
  const [hasClipboard, setHasClipboard] = createSignal(false);
  const [tool, setTool] = createSignal<SelectionTool>('lasso');
  const [mode, setMode] = createSignal<SelectionMode>('replace');
  const [wand, setWand] = createSignal<WandSettings>({
    tolerance: 32,
    contiguous: true,
    source: 'layer',
    antialias: true
  });
  const [preview, setPreview, currentPreview] = createImmediateSignal<SelectionPreview | undefined>(undefined);
  /** The pointer gesture or polygon in progress. */
  let gesture:
    | { kind: 'lasso'; mode: SelectionMode; points: Point[] }
    | { kind: 'rectangle' | 'ellipse'; mode: SelectionMode; start: Point }
    | { kind: 'polygon'; mode: SelectionMode; corners: Point[]; pointer: Point; pressedAt: number }
    | { kind: 'move'; start: Point; offset: Point }
    | undefined;
  const [drawing, setDrawing] = createSignal(false);

  return {
    /** What the engine reports of the selection; see `SelectionSummary`. */
    summary,
    /** Whether anything is selected. */
    selected: () => summary().selected,
    /** A selection change or pixel command is waiting for the engine. */
    busy,
    /** Like `busy`, including a change started earlier in the current event; for synchronous guards. */
    isBusy,
    /** A gesture is in progress, including an open polygon. */
    drawing,
    /** The engine holds copied pixels that Paste can insert. */
    hasClipboard,
    /** The tool that the next press uses. */
    tool,
    setTool(next: SelectionTool) {
      cancel();
      setTool(next);
    },
    /** How the next shape or wand region combines with the selection, unless keys say otherwise. */
    mode,
    setMode,
    /** Magic wand settings. */
    wand,
    updateWand(patch: Partial<WandSettings>) {
      setWand({ ...wand(), ...patch });
    },
    /** The gesture shown before it applies, for the outline. */
    preview,
    /** Runs a command on the selected pixels; see `SelectionAction`. */
    action,
    /** Selects everything, as far as the canvas reaches. */
    selectAll: () => change({ op: 'all' }),
    /** Removes the selection, ending a gesture first. */
    clear() {
      cancel();
      change({ op: 'clear' });
    },
    /** Selects what is not selected. */
    invert: () => change({ op: 'invert' }),
    /** Softens the selection's edges by `radius` document pixels. */
    feather: (radius: number) => change({ op: 'feather', radius }),
    /** Ends a gesture or open polygon without applying it. */
    cancel,
    /**
     * A press of the active tool at `point`: starts moving the selection, a shape or a polygon corner, closes the
     * polygon, or runs the magic wand.
     */
    begin(point: Point, keys: { shiftKey: boolean; altKey: boolean } = { shiftKey: false, altKey: false }) {
      if (isBusy() || !options.ready()) {
        return;
      }

      if (gesture?.kind === 'polygon') {
        corner(point);
        return;
      }

      const chosen = keyMode(keys) ?? mode();
      if (tool() === 'wand') {
        const settings = wand();
        change({ op: 'wand', point, area: options.area(), ...settings, mode: chosen });
        return;
      }

      if (chosen === 'replace' && !keyMode(keys) && hitsSelection(currentSummary(), point)) {
        gesture = { kind: 'move', start: point, offset: { x: 0, y: 0 } };
        setPreview({ kind: 'offset', offset: { x: 0, y: 0 } });
      } else if (tool() === 'polygon') {
        gesture = { kind: 'polygon', mode: chosen, corners: [point], pointer: point, pressedAt: performance.now() };
        showShape();
      } else if (tool() === 'lasso') {
        gesture = { kind: 'lasso', mode: chosen, points: [point] };
        showShape();
      } else {
        gesture = { kind: tool() as 'rectangle' | 'ellipse', mode: chosen, start: point };
        setPreview(undefined);
      }

      setDrawing(true);
    },
    /** Continues the gesture to `point`: drags the outline, extends the lasso, spans the shape or places the corner. */
    move(point: Point) {
      if (!gesture) {
        return;
      }

      if (gesture.kind === 'move') {
        gesture.offset = { x: Math.round(point.x - gesture.start.x), y: Math.round(point.y - gesture.start.y) };
        setPreview({ kind: 'offset', offset: gesture.offset });
        return;
      }

      if (gesture.kind === 'polygon') {
        gesture.corners[gesture.corners.length - 1] = point;
        gesture.pointer = point;
        showShape();
        return;
      }

      if (gesture.kind !== 'lasso') {
        setPreview({ kind: 'shape', points: spannedShape(gesture.kind, gesture.start, point), mode: gesture.mode });
        return;
      }

      const last = gesture.points.at(-1)!;
      if (last.x === point.x && last.y === point.y) {
        return;
      }

      // Keep a bounded path for long drags without truncating its endpoint.
      const sampled =
        gesture.points.length >= maxShapePoints - 1
          ? gesture.points.filter((_, index) => index % 2 === 0)
          : gesture.points;
      gesture.points = [...sampled, point];
      showShape();
    },
    /** The pointer hovering at `point` while a polygon is open: its next edge follows it. */
    hover(point: Point) {
      if (gesture?.kind === 'polygon') {
        gesture.pointer = point;
        showShape();
      }
    },
    /** Releases the press: applies a lasso, shape or move; a polygon stays open for its next corner. */
    end() {
      const finished = gesture;
      if (!finished || finished.kind === 'polygon') {
        return;
      }

      gesture = undefined;
      setDrawing(false);
      if (finished.kind === 'move') {
        setPreview(undefined);
        if (finished.offset.x || finished.offset.y) {
          change({ op: 'translate', offset: finished.offset });
        }

        return;
      }

      const shape = currentPreview();
      setPreview(undefined);
      apply(shape?.kind === 'shape' ? shape.points : [], finished.mode);
    },
    /** Closes the open polygon and applies it. */
    finish() {
      if (gesture?.kind !== 'polygon') {
        return;
      }

      const { corners, mode: chosen } = gesture;
      gesture = undefined;
      setDrawing(false);
      setPreview(undefined);
      apply(corners, chosen);
    },
    /**
     * Applies the engine's selection summary and clipboard state, after a change or a pixel command, or a reset when
     * the engine is replaced.
     */
    receive(event: SelectionEvent) {
      setSummary(event.selection);
      setHasClipboard(event.hasClipboard);
      setBusy(false);
    }
  };

  /** Adds a polygon corner at `point`, or closes the polygon when the press is on its first corner or a double press. */
  function corner(point: Point) {
    if (gesture?.kind !== 'polygon') {
      return;
    }

    const { corners } = gesture;
    const first = corners[0]!,
      last = corners.at(-1)!;
    const near = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) <= options.closeDistance();
    const double = performance.now() - gesture.pressedAt < doublePressMs && near(point, last);
    if (corners.length >= 3 && (near(point, first) || double)) {
      const chosen = gesture.mode;
      gesture = undefined;
      setDrawing(false);
      setPreview(undefined);
      apply(corners, chosen);
      return;
    }

    if (corners.length < maxShapePoints) {
      corners.push(point);
    }

    gesture.pointer = point;
    gesture.pressedAt = performance.now();
    showShape();
  }

  /** Shows the gesture's shape so far: the lasso path, or the polygon's corners and the edge to the pointer. */
  function showShape() {
    if (gesture?.kind === 'lasso') {
      setPreview({ kind: 'shape', points: gesture.points, mode: gesture.mode });
    } else if (gesture?.kind === 'polygon') {
      const last = gesture.corners.at(-1)!;
      const points =
        last.x === gesture.pointer.x && last.y === gesture.pointer.y
          ? gesture.corners
          : [...gesture.corners, gesture.pointer];
      setPreview(points.length >= 3 ? { kind: 'shape', points, mode: gesture.mode } : undefined);
    }
  }

  /**
   * Applies a closed shape. One that encloses no pixel, such as a click, deselects when it would replace the
   * selection, as a click with Photoshop's marquee does, and changes nothing otherwise.
   */
  function apply(points: readonly Point[], chosen: SelectionMode) {
    if (enclosedArea(points) >= minimumArea) {
      change({ op: 'shape', points: [...points], mode: chosen });
    } else if (chosen === 'replace' && currentSummary().selected) {
      change({ op: 'clear' });
    }
  }

  /** Sends a selection change; ignored while another is applying. */
  function change(command: SelectionCommand) {
    if (isBusy() || !options.ready()) {
      return;
    }

    setBusy(true);
    void options.run(selectionEdit.command(command)).then((result) => {
      // A change that leaves the selection as it was still gets a selection event; a failure gets none.
      if (result.isErr()) {
        setBusy(false);
        options.onError(result.error);
      }
    });
  }

  /**
   * Sends one pixel command on the selection in the active layer. Ignored while another command or change is applying,
   * during a gesture, before the engine is ready, or without a selection (except Paste).
   */
  function action(kind: SelectionAction) {
    if (isBusy() || gesture || !options.ready() || (kind !== 'paste' && !currentSummary().selected)) {
      return;
    }

    setBusy(true);
    const { activeId, revision } = options.document();
    options.send({ type: 'selection', action: kind, layerId: activeId, revision });
  }

  function cancel() {
    gesture = undefined;
    setDrawing(false);
    setPreview(undefined);
  }
}

/** The selection state and commands used by the editor. */
export type Selection = ReturnType<typeof createSelection>;

/**
 * How a press selects: a freehand outline, a polygon of pressed corners, a rectangle or ellipse spanned by a drag, or
 * the magic wand's similar colors.
 */
export type SelectionTool = 'lasso' | 'polygon' | 'rectangle' | 'ellipse' | 'wand';

/** Magic wand settings; see `selectionEdit`'s `wand` command. */
export type WandSettings = { tolerance: number; contiguous: boolean; source: 'layer' | 'all'; antialias: boolean };

/** The mode that keys held at a press choose, as in Photoshop: Shift adds, Alt subtracts, both intersect. */
function keyMode(keys: { shiftKey: boolean; altKey: boolean }): SelectionMode | undefined {
  if (keys.shiftKey && keys.altKey) {
    return 'intersect';
  }

  return keys.shiftKey ? 'add' : keys.altKey ? 'subtract' : undefined;
}

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

/** Most points of a shape's outline, as the engine accepts. */
const maxShapePoints = 4096;

/** A second press on the last polygon corner within this many milliseconds closes the polygon. */
const doublePressMs = 400;

/** Smallest outline area, in square document pixels, applied as a shape. */
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
