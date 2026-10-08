import { createSignal } from 'solid-js';

/**
 * The mockup's drawing: a fixed sheet that stands in for the infinite canvas, a view that pans, zooms and rotates
 * around the window's center, and round-tipped strokes with undo and redo. Strokes are kept as points and replayed on
 * undo, so history costs no pixel copies. Must be created within a Solid owner.
 */
export function createMockCanvas() {
  const [view, setView] = createSignal<View>(fittedView());
  const [history, setHistory] = createSignal({ canUndo: false, canRedo: false });
  const strokes: Stroke[] = [];
  let undone: Stroke[] = [];
  let main: HTMLCanvasElement | undefined;
  let scratch: HTMLCanvasElement | undefined;
  /** The stroke being drawn and the pointer drawing it. */
  let active: { pointer: number; stroke: Stroke } | undefined;
  const [live, setLive] = createSignal<Stroke>();

  const publish = () => setHistory({ canUndo: strokes.length > 0, canRedo: undone.length > 0 });

  return {
    sheet,
    view,
    history,
    /** The stroke in progress, for styling the scratch canvas it is drawn into. */
    live,
    /** Binds the canvas that holds finished strokes. */
    bindMain(element: HTMLCanvasElement) {
      main = element;
    },
    /** Binds the canvas that shows a stroke in progress before it is composited. */
    bindScratch(element: HTMLCanvasElement) {
      scratch = element;
    },
    /** The CSS transform of the sheet, which is centered in the window before it applies. */
    transform: () => {
      const { x, y, scale, angle, flipped } = view();
      return `translate(${x}px, ${y}px) rotate(${angle}deg) scale(${flipped ? -scale : scale}, ${scale})`;
    },
    /** Moves the view by CSS pixels. */
    pan(dx: number, dy: number) {
      setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
    },
    /**
     * Moves, scales and turns the view as two fingers do: `factor` and `degrees` pivot around `point` (client CSS
     * pixels), then the view moves by `dx`, `dy`.
     */
    gesture(point: { x: number; y: number }, factor: number, degrees: number, dx: number, dy: number) {
      setView((current) => {
        const pivot = { x: point.x - innerWidth / 2, y: point.y - innerHeight / 2 };
        const scale = Math.min(16, Math.max(0.05, current.scale * factor));
        const applied = scale / current.scale;
        const scaled = { x: pivot.x + (current.x - pivot.x) * applied, y: pivot.y + (current.y - pivot.y) * applied };
        const turned = rotate({ x: scaled.x - pivot.x, y: scaled.y - pivot.y }, degrees);
        return {
          ...current,
          scale,
          angle: normalizeAngle(current.angle + degrees),
          x: pivot.x + turned.x + dx,
          y: pivot.y + turned.y + dy
        };
      });
    },
    /** Scales the view around the window's center, between 5% and 1600%. */
    zoomBy(factor: number) {
      setView((current) => {
        const scale = Math.min(16, Math.max(0.05, current.scale * factor));
        const applied = scale / current.scale;
        return { ...current, x: current.x * applied, y: current.y * applied, scale };
      });
    },
    /** Turns the view around the window's center, in degrees clockwise. */
    rotateBy(degrees: number) {
      setView((current) => {
        const { x, y } = rotate({ x: current.x, y: current.y }, degrees);
        return { ...current, x, y, angle: normalizeAngle(current.angle + degrees) };
      });
    },
    /** Shows the sheet at 100%, keeping the point at the window's center. */
    resetZoom() {
      setView((current) => ({ ...current, x: current.x / current.scale, y: current.y / current.scale, scale: 1 }));
    },
    /** Straightens the view, keeping the point at the window's center. */
    resetRotation() {
      setView((current) => ({ ...current, ...rotate({ x: current.x, y: current.y }, -current.angle), angle: 0 }));
    },
    /** Mirrors the view horizontally around the window's center, keeping the point there. */
    flip() {
      setView((current) => ({
        ...current,
        x: -current.x,
        angle: normalizeAngle(-current.angle),
        flipped: !current.flipped
      }));
    },
    /** Fits the whole sheet in the window, straight and unmirrored. */
    fit() {
      setView(fittedView());
    },
    /** Starts a stroke at a pointer press; `brush` is read once, so settings changed mid-stroke wait for the next. */
    begin(event: PointerEvent, brush: Brush) {
      if (active || !main || !scratch) {
        return;
      }

      undone = [];
      active = { pointer: event.pointerId, stroke: { ...brush, points: [sample(event)] } };
      setLive(active.stroke);
      const [point] = active.stroke.points;
      drawSegment(brush.erase ? erasing(main, brush) : context(scratch), active.stroke, point!, point!);
    },
    /** Extends the stroke with every position the pointer reported since the last event. */
    extend(event: PointerEvent) {
      if (active?.pointer !== event.pointerId || !main || !scratch) {
        return;
      }

      const { stroke } = active;
      const target = stroke.erase ? erasing(main, stroke) : context(scratch);
      for (const coalesced of event.getCoalescedEvents?.() ?? [event]) {
        const point = sample(coalesced);
        drawSegment(target, stroke, stroke.points.at(-1)!, point);
        stroke.points.push(point);
      }
    },
    /** Finishes the stroke started by this pointer, compositing it into the sheet. */
    end(event: PointerEvent) {
      if (active?.pointer !== event.pointerId || !main || !scratch) {
        return;
      }

      const { stroke } = active;
      active = undefined;
      setLive(undefined);
      if (!stroke.erase) {
        composite(main, scratch, stroke);
      }

      strokes.push(stroke);
      publish();
    },
    /** Clears the drawing and its history. */
    clear() {
      strokes.length = 0;
      undone = [];
      replay();
      publish();
    },
    undo() {
      const stroke = strokes.pop();
      if (stroke) {
        undone.push(stroke);
        replay();
        publish();
      }
    },
    redo() {
      const stroke = undone.pop();
      if (stroke) {
        strokes.push(stroke);
        replay();
        publish();
      }
    },
    /** How soft the stroke in progress is, as a CSS blur radius in sheet pixels. */
    softness
  };

  /** A pointer position in sheet pixels, with the pen's pressure. */
  function sample(event: PointerEvent): StrokePoint {
    const { x, y, scale, angle, flipped } = view();
    const local = rotate({ x: event.clientX - innerWidth / 2 - x, y: event.clientY - innerHeight / 2 - y }, -angle);
    return {
      x: local.x / (flipped ? -scale : scale) + sheet.width / 2,
      y: local.y / scale + sheet.height / 2,
      pressure: event.pointerType === 'pen' ? Math.max(0.05, event.pressure) : 1
    };
  }

  /** Redraws every remaining stroke onto a blank sheet. */
  function replay() {
    if (!main || !scratch) {
      return;
    }

    context(main).clearRect(0, 0, sheet.width, sheet.height);
    for (const stroke of strokes) {
      const target = stroke.erase ? erasing(main, stroke) : context(scratch);
      stroke.points.forEach((point, index) => drawSegment(target, stroke, stroke.points[index - 1] ?? point, point));
      if (!stroke.erase) {
        composite(main, scratch, stroke);
      }
    }
  }
}

/** Sheet size in pixels. */
const sheet = { width: 2400, height: 1600 };

/**
 * Where the sheet sits: its center's offset from the window's center in CSS pixels, its scale, its angle and whether
 * it is mirrored horizontally (before rotating).
 */
export type View = { x: number; y: number; scale: number; angle: number; flipped: boolean };

/** What a new stroke paints with. Size is a diameter in sheet pixels, opacity and hardness are 0–100. */
export type Brush = {
  erase: boolean;
  color: string;
  size: number;
  opacity: number;
  hardness: number;
  /** Pen pressure scales the diameter. */
  pressureSize: boolean;
};

type StrokePoint = { x: number; y: number; pressure: number };
type Stroke = Brush & { points: StrokePoint[] };

function fittedView(): View {
  const scale = Math.min(innerWidth / sheet.width, innerHeight / sheet.height) * 0.94;
  return { x: 0, y: 0, scale, angle: 0, flipped: false };
}

function rotate(point: { x: number; y: number }, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians),
    sin = Math.sin(radians);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

/** An angle in degrees within (-180, 180]. */
function normalizeAngle(degrees: number) {
  const turned = ((degrees % 360) + 360) % 360;
  return turned > 180 ? turned - 360 : turned;
}

/** Blur radius in sheet pixels that softens a stroke of this hardness. */
function softness(brush: Pick<Brush, 'size' | 'hardness'>) {
  return ((100 - brush.hardness) / 100) * brush.size * 0.18;
}

function context(canvas: HTMLCanvasElement) {
  return canvas.getContext('2d')!;
}

/** The sheet's context set up to erase: strokes remove paint at the brush's opacity. */
function erasing(main: HTMLCanvasElement, brush: Brush) {
  const target = context(main);
  target.globalCompositeOperation = 'destination-out';
  target.globalAlpha = brush.opacity / 100;
  target.filter = 'none';
  return target;
}

/** Strokes one round-capped segment; a zero-length segment draws a dot. */
function drawSegment(target: CanvasRenderingContext2D, stroke: Stroke, from: StrokePoint, to: StrokePoint) {
  target.lineCap = 'round';
  target.lineJoin = 'round';
  target.strokeStyle = stroke.erase ? '#000' : stroke.color;
  target.lineWidth = Math.max(0.5, stroke.size * (stroke.pressureSize ? to.pressure : 1));
  target.beginPath();
  target.moveTo(from.x, from.y);
  target.lineTo(to.x, to.y);
  target.stroke();
}

/** Draws the opaque stroke from the scratch canvas into the sheet at the stroke's opacity and softness. */
function composite(main: HTMLCanvasElement, scratch: HTMLCanvasElement, stroke: Stroke) {
  const target = context(main);
  target.globalCompositeOperation = 'source-over';
  target.globalAlpha = stroke.opacity / 100;
  const blur = softness(stroke);
  target.filter = blur > 0.3 ? `blur(${blur}px)` : 'none';
  target.drawImage(scratch, 0, 0);
  target.filter = 'none';
  target.globalAlpha = 1;
  context(scratch).clearRect(0, 0, sheet.width, sheet.height);
}
