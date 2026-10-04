import type { Point } from '@app-game/paint-core/camera';
import type { PaintCommand } from '@app-game/paint-core/protocol';
import type { Result } from 'neverthrow';
import { createMemo, createSignal, getOwner, isDisposed } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import type { PaintError } from '../../shared/errors';
import { applyAffine, boxAffine, type Affine } from './affine';
import { applyProjective, fromAffine, rectToQuad, type Projective } from './projective';
import { transformEdit, type TransformBounds, type TransformCommand } from './transformEdit';

/**
 * The UI half of the transform, whose engine half is `transformEdit` in the drawing engine's recipe: one transform
 * session at a time over the lasso selection, or the whole active layer without one. The box follows every change at
 * once; the engine moves its floating copy of the pixels with at most one update in flight, always the latest, and
 * the document changes only when `end` keeps the result as one undo step. `cancel` leaves the pixels where they were. Must be created within a Solid owner; replies arriving after
 * disposal are dropped.
 */
export function createTransform(options: {
  /** Runs an edit and resolves its reply; see `PaintEngine.runEdit`. */
  run: (command: Extract<PaintCommand, { type: 'edit' }>) => Promise<Result<unknown, PaintError>>;
  /** The lasso outline to transform; fewer than three points transforms the whole active layer. */
  selection: () => readonly Point[];
  /** Whether a transform can start: the engine accepts edits and no stroke or other edit runs. */
  canStart: () => boolean;
  /** Runs when a session has started, for example to hide the lasso outline the transform replaces. */
  onStart?: () => void;
  /** Receives the outline transformed with its pixels when a selection transform ends. */
  onSelection: (points: Point[]) => void;
  onError: (error: PaintError) => void;
}) {
  const owner = getOwner()!;
  const [session, setSession, currentSession] = createImmediateSignal<Session | undefined>(undefined);
  const [box, setBox, currentBox] = createImmediateSignal<BoxState>(initialBox);
  const [starting, setStarting] = createSignal(false);
  const [settings, setSettings, currentSettings] = createImmediateSignal<TransformSettings>({
    proportional: true,
    interpolation: 'smooth'
  });
  const matrix = createMemo(() => transformMatrix(session()?.bounds, box()));
  /** Commands in sending order; each starts after the previous one's reply. */
  let chain: Promise<unknown> = Promise.resolve();
  /** The latest matrix waiting in `chain`; later changes replace it instead of queueing more updates. */
  let queued: Projective | undefined;

  return {
    /** A transform session is open. */
    active: () => session() !== undefined,
    starting,
    /** Bounds of the pixels as the transform began, in document pixels. */
    bounds: () => session()?.bounds,
    /** The current transform from those bounds to where the pixels go. */
    matrix,
    box,
    /** How corner handles scale and how pixels are resampled. */
    settings,
    /** Changes the settings; a new interpolation redraws the pixels. */
    setSettings(patch: Partial<TransformSettings>) {
      const next = { ...currentSettings(), ...patch };
      setSettings(next);
      if (patch.interpolation !== undefined) {
        change(currentBox());
      }
    },
    start,
    setBox: change,
    /** Mirrors the pixels horizontally or vertically within the box. */
    flip(axis: 'x' | 'y') {
      const current = currentBox();
      if (current.corners) {
        const [a, b, c, d] = current.corners;
        change({ ...current, corners: axis === 'x' ? [b, a, d, c] : [d, c, b, a] });
        return;
      }

      change({ ...current, scale: { ...current.scale, [axis]: -current.scale[axis] } });
    },
    /** Turns the box by a quarter turn clockwise. */
    rotate() {
      const current = currentBox();
      const bounds = currentSession()?.bounds;
      if (current.corners && bounds) {
        const center = applyProjective(transformMatrix(bounds, current), {
          x: (bounds.left + bounds.right) / 2,
          y: (bounds.top + bounds.bottom) / 2
        });
        const turn = ({ x, y }: Point): Point => ({ x: center.x - (y - center.y), y: center.y + (x - center.x) });
        change({ ...current, corners: current.corners.map(turn) as unknown as Quad });
        return;
      }

      change({ ...current, angle: current.angle + Math.PI / 2 });
    },
    /**
     * Distorts the box by its corners, which then move on their own, in perspective; turned off, the box returns to
     * its shape from before the distortion.
     */
    distort(on: boolean) {
      const current = currentBox();
      const bounds = currentSession()?.bounds;
      if (!bounds || on === !!current.corners) {
        return;
      }

      if (!on) {
        change({ offset: current.offset, scale: current.scale, angle: current.angle });
        return;
      }

      const matrix = boxMatrix(bounds, current);
      const corners = [
        { x: bounds.left, y: bounds.top },
        { x: bounds.right, y: bounds.top },
        { x: bounds.right, y: bounds.bottom },
        { x: bounds.left, y: bounds.bottom }
      ].map((corner) => applyAffine(matrix, corner));
      change({ ...current, corners: corners as unknown as Quad });
    },
    /** Returns the box to the original placement, keeping the session. */
    reset() {
      change(initialBox);
    },
    end: () => finish('end'),
    cancel: () => finish('cancel'),
    /** Canvas contact handler: while transforming, pen and mouse contacts on the canvas neither draw nor select. */
    canvasAction: {
      enabled: (event: Pick<PointerEvent, 'pointerType'>) =>
        currentSession() !== undefined && event.pointerType !== 'touch',
      run: () => {}
    }
  };

  /** Starts a session over the selection, or the whole active layer; reports why it cannot start. */
  async function start() {
    if (currentSession() || starting() || !options.canStart()) {
      return;
    }

    const points = options.selection().length >= 3 ? [...options.selection()] : undefined;
    setStarting(true);
    const begun = await send({ phase: 'begin', points });
    if (isDisposed(owner)) {
      return;
    }

    setStarting(false);
    if (begun.isErr()) {
      options.onError(begun.error);
      return;
    }

    setBox(initialBox);
    setSession({ bounds: (begun.value as { bounds: TransformBounds }).bounds, points });
    options.onStart?.();
  }

  /** Replaces the box: offset, scale and angle about the center of the bounds; the pixels follow. */
  function change(next: BoxState) {
    const current = currentSession();
    if (!current) {
      return;
    }

    setBox(next);
    const waiting = queued !== undefined;
    queued = transformMatrix(current.bounds, next);
    if (!waiting) {
      chain = chain.then(async () => {
        const latest = queued!;
        queued = undefined;
        const updated = await send({
          phase: 'update',
          matrix: [...latest],
          interpolation: currentSettings().interpolation
        });
        if (updated.isErr() && !isDisposed(owner)) {
          options.onError(updated.error);
        }
      });
    }
  }

  /** Waits for pending updates, then ends or cancels the session; a transformed selection keeps its outline. */
  async function finish(phase: 'end' | 'cancel') {
    const current = currentSession();
    if (!current) {
      return;
    }

    const finalMatrix = transformMatrix(current.bounds, currentBox());
    setSession(undefined);
    const finishing = chain.then(() => send({ phase }));
    chain = finishing;
    const finished = await finishing;
    if (isDisposed(owner)) {
      return;
    }

    if (finished.isErr()) {
      options.onError(finished.error);
      return;
    }

    if (current.points) {
      options.onSelection(
        phase === 'end' ? current.points.map((point) => applyProjective(finalMatrix, point)) : current.points
      );
    }
  }

  function send(command: TransformCommand) {
    return options.run(transformEdit.command(command));
  }
}

/** The transform state used by the editor. */
export type Transform = ReturnType<typeof createTransform>;

/**
 * Transform settings: corner handles keep the proportions (Shift does the opposite), and `pixels` resamples with the
 * nearest pixel for pixel art instead of smoothly.
 */
export type TransformSettings = { proportional: boolean; interpolation: 'smooth' | 'pixels' };

/**
 * Box edits about the center of the bounds: scale (negative flips), clockwise angle in radians, then offset. A
 * distorted box sets `corners`, where the bounds' corners go (top-left, top-right, bottom-right, bottom-left), which
 * then replace the other edits; they stay as they were, for when the distortion is turned off.
 */
export type BoxState = { offset: Point; scale: Point; angle: number; corners?: Quad };

/** Four corners, clockwise from the top-left, of a convex quad. */
export type Quad = readonly [Point, Point, Point, Point];

/** One transform session: the bounds of its pixels and the lasso outline, if it transforms a selection. */
type Session = { bounds: TransformBounds; points: Point[] | undefined };

const initialBox: BoxState = { offset: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, angle: 0 };

/** Where `box` takes the pixels of `bounds`: to its corners in perspective when distorted, otherwise as `boxMatrix`. */
export function transformMatrix(bounds: TransformBounds | undefined, box: BoxState): Projective {
  return bounds && box.corners ? rectToQuad(bounds, box.corners) : fromAffine(boxMatrix(bounds, box));
}

/** The affine transform of `box` about the center of `bounds`, ignoring `corners`. */
export function boxMatrix(bounds: TransformBounds | undefined, box: BoxState): Affine {
  const pivot = bounds ? { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 } : { x: 0, y: 0 };
  return boxAffine({ pivot, ...box });
}
