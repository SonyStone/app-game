import { createSignal } from 'solid-js';
import { paintStillLife } from './stillLife';

/**
 * The gallery's drawing: a sheet of layers that stands in for Paint's infinite canvas, a view that pans, zooms, turns
 * and mirrors around a point, and round-tipped strokes with undo and redo.
 *
 * Every layer is its own canvas element, so its visibility, opacity and blend mode are CSS on the element and cost no
 * redraw. Strokes are kept as points and replayed into their layer on undo, after the layer's starting artwork, so
 * history costs no pixel copies. Only strokes are history; layer edits apply at once. Must be created within a Solid
 * owner.
 */
export function createSketchCanvas() {
  const [view, setView] = createSignal<View>(fittedView());
  const [layers, setLayers] = createSignal<readonly Layer[]>(startingLayers);
  const [activeLayer, setActiveLayer] = createSignal<LayerId>('ink');
  const [revisions, setRevisions] = createSignal<Readonly<Record<LayerId, number>>>({});
  const [history, setHistory] = createSignal({ done: 0, undone: 0 });
  const [live, setLive] = createSignal<Stroke>();
  const canvases = new Map<LayerId, HTMLCanvasElement>();
  /** Pixels of duplicated layers, which stand in for the starting artwork of the copies. */
  const copies = new Map<LayerId, HTMLCanvasElement>();
  const done: Stroke[] = [];
  let undone: Stroke[] = [];
  /** The stage's canvas that shows a stroke in progress inside the active layer. */
  let scratch: HTMLCanvasElement | undefined;
  /** An offscreen canvas that replays strokes, so that replaying never touches the stroke in progress. */
  let work: HTMLCanvasElement | undefined;
  /** The stroke being drawn, the pointer drawing it and its smoothed position. */
  let active: { pointer: number; stroke: Stroke; smoothed: StrokePoint } | undefined;
  let nextLayer = 1;

  const publish = () => setHistory({ done: done.length, undone: undone.length });
  const touched = (id: LayerId) => setRevisions((all) => ({ ...all, [id]: (all[id] ?? 0) + 1 }));
  const layer = (id: LayerId) => layers().find((entry) => entry.id === id);

  return {
    sheet,
    view,
    /** Layers from the top down. */
    layers,
    activeLayer,
    /** How many strokes can be undone and redone. */
    history,
    /** The stroke in progress, which the scratch canvas shows before it is composited. */
    live,
    /** Counts the redraws of a layer's pixels, so that thumbnails can follow them. */
    revision: (id: LayerId) => revisions()[id] ?? 0,
    /** The canvas holding a layer's pixels, once the stage has rendered it. */
    layerCanvas: (id: LayerId) => canvases.get(id),
    /**
     * Binds the canvas of layer `id`, sizes it to the sheet and paints its starting artwork and strokes into it. The
     * canvas must not set `width` or `height` itself: changing them later would clear it.
     */
    bindLayer: (id: LayerId) => (element: HTMLCanvasElement) => {
      element.width = sheet.width;
      element.height = sheet.height;
      canvases.set(id, element);
      replay(id);
    },
    /** Binds and sizes the canvas that shows a stroke in progress inside the active layer. */
    bindScratch(element: HTMLCanvasElement) {
      element.width = sheet.width;
      element.height = sheet.height;
      scratch = element;
    },
    /** The sheet's CSS transform; the sheet is centered in the window before it applies. */
    transform: () => {
      const { x, y, scale, angle, flipped } = view();
      return `translate(${x}px, ${y}px) rotate(${angle}deg) scale(${flipped ? -scale : scale}, ${scale})`;
    },

    selectLayer: setActiveLayer,
    /** Changes a layer's name, visibility, lock, opacity or blend mode. */
    updateLayer(id: LayerId, change: Partial<Omit<Layer, 'id'>>) {
      setLayers((list) => list.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)));
    },
    /** Adds an empty layer above the active one and makes it active; returns its id. */
    addLayer() {
      const id = `layer-${nextLayer}`;
      const added: Layer = {
        id,
        name: `Layer ${nextLayer}`,
        visible: true,
        locked: false,
        opacity: 100,
        blend: 'normal'
      };
      nextLayer += 1;
      const index = Math.max(
        0,
        layers().findIndex((entry) => entry.id === activeLayer())
      );
      setLayers((list) => [...list.slice(0, index), added, ...list.slice(index)]);
      setActiveLayer(id);
      return id;
    },
    /** Copies the active layer, its pixels included, above it and makes the copy active. */
    duplicateLayer() {
      const source = layer(activeLayer());
      if (!source) {
        return;
      }

      const id = `layer-${nextLayer}`;
      nextLayer += 1;
      const sourceCanvas = canvases.get(source.id);
      if (sourceCanvas) {
        copies.set(id, snapshot(sourceCanvas));
      }

      const index = layers().findIndex((entry) => entry.id === source.id);
      const copy = { ...source, id, name: `${source.name} copy`, locked: false };
      setLayers((list) => [...list.slice(0, index), copy, ...list.slice(index)]);
      setActiveLayer(id);
    },
    /** Removes the active layer, unless it is the last one, and activates its neighbour below (or above). */
    deleteLayer() {
      const list = layers();
      const index = list.findIndex((entry) => entry.id === activeLayer());
      if (list.length <= 1 || index < 0) {
        return;
      }

      const removed = list[index]!.id;
      setLayers(list.filter((entry) => entry.id !== removed));
      setActiveLayer(list[index + 1]?.id ?? list[index - 1]!.id);
      canvases.delete(removed);
    },
    /** Moves the active layer one place up (toward the top of the list) or down. */
    moveLayer(direction: 'up' | 'down') {
      const list = [...layers()];
      const index = list.findIndex((entry) => entry.id === activeLayer());
      const target = direction === 'up' ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= list.length) {
        return;
      }

      [list[index], list[target]] = [list[target]!, list[index]!];
      setLayers(list);
    },

    /** Moves the view by CSS pixels. */
    pan(dx: number, dy: number) {
      setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
    },
    gesture,
    /** Scales the view by `factor` around `point` (client CSS pixels; the window's center by default), 5%–1600%. */
    zoomBy(factor: number, point: Point = windowCenter()) {
      gesture(point, factor, 0);
    },
    /** Sets the zoom, 0.05–16, around `point` (the window's center by default). */
    zoomTo(scale: number, point: Point = windowCenter()) {
      gesture(point, scale / view().scale, 0);
    },
    /** Turns the view by `degrees` clockwise around `point` (the window's center by default). */
    rotateBy(degrees: number, point: Point = windowCenter()) {
      gesture(point, 1, degrees);
    },
    /** Sets the view's angle in degrees clockwise, around the window's center. */
    rotateTo(degrees: number) {
      gesture(windowCenter(), 1, normalizeAngle(degrees - view().angle));
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

    /**
     * Starts a stroke of this pointer in the active layer; returns whether it started. The brush is read once, so
     * settings changed mid-stroke wait for the next stroke.
     */
    begin(event: PointerEvent, brush: Brush) {
      const target = layer(activeLayer());
      if (active || !scratch || !target) {
        return false;
      }

      undone = [];
      const point = sample(event);
      active = { pointer: event.pointerId, stroke: { ...brush, layer: target.id, points: [point] }, smoothed: point };
      setLive(active.stroke);
      drawSegment(drawingContext(active.stroke, scratch), active.stroke, point, point);
      return true;
    },
    /** Extends the stroke with every position the pointer reported since the last event, smoothed as the brush asks. */
    extend(event: PointerEvent) {
      if (active?.pointer !== event.pointerId || !scratch) {
        return;
      }

      const { stroke } = active;
      const context = drawingContext(stroke, scratch);
      const follow = 1 - Math.min(0.94, stroke.smoothing * 0.94);
      for (const coalesced of event.getCoalescedEvents?.() ?? [event]) {
        const raw = sample(coalesced);
        const previous = active.smoothed;
        const point = {
          x: previous.x + (raw.x - previous.x) * follow,
          y: previous.y + (raw.y - previous.y) * follow,
          pressure: raw.pressure
        };
        active.smoothed = point;
        drawSegment(context, stroke, stroke.points.at(-1)!, point);
        stroke.points.push(point);
      }
    },
    /** Finishes the stroke of this pointer, compositing it into its layer. */
    end(event: PointerEvent) {
      if (active?.pointer !== event.pointerId) {
        return;
      }

      const { stroke } = active;
      active = undefined;
      setLive(undefined);
      const target = canvases.get(stroke.layer);
      if (target && scratch && !stroke.erase) {
        composite(target, scratch, stroke);
      }

      done.push(stroke);
      publish();
      touched(stroke.layer);
    },
    /** Whether a stroke is being drawn. */
    drawing: () => live() !== undefined,
    undo() {
      const stroke = done.pop();
      if (stroke) {
        undone.push(stroke);
        replay(stroke.layer);
        publish();
      }
    },
    redo() {
      const stroke = undone.pop();
      if (stroke) {
        done.push(stroke);
        replay(stroke.layer);
        publish();
      }
    },
    /** Clears every stroke and the history, keeping the starting artwork. */
    clear() {
      const affected = new Set([...done, ...undone].map((stroke) => stroke.layer));
      done.length = 0;
      undone = [];
      affected.forEach(replay);
      publish();
    },

    /** The color the visible layers show at a client point, or `undefined` off the sheet. */
    colorAt(point: Point) {
      const at = toSheet(point);
      const x = Math.floor(at.x);
      const y = Math.floor(at.y);
      if (x < 0 || y < 0 || x >= sheet.width || y >= sheet.height) {
        return undefined;
      }

      let rgb: Rgb = [1, 1, 1];
      for (const entry of [...layers()].reverse()) {
        const canvas = canvases.get(entry.id);
        if (!entry.visible || !canvas) {
          continue;
        }

        const [r = 0, g = 0, b = 0, a = 0] = canvas
          .getContext('2d', { willReadFrequently: true })!
          .getImageData(x, y, 1, 1).data;
        const alpha = (a / 255) * (entry.opacity / 100);
        const blended = blendChannels(rgb, [r / 255, g / 255, b / 255], entry.blend);
        rgb = rgb.map((channel, index) => channel + (blended[index]! - channel) * alpha) as Rgb;
      }

      return `#${rgb
        .map((channel) =>
          Math.round(channel * 255)
            .toString(16)
            .padStart(2, '0')
        )
        .join('')}`;
    },
    /** Converts a client point to sheet pixels. */
    toSheet,
    /** How soft a stroke of this brush is, as a CSS blur radius in sheet pixels. */
    softness
  };

  /**
   * Moves, scales and turns the view as two fingers do: `factor` and `degrees` pivot around `point` (client CSS
   * pixels), then the view moves by `dx`, `dy`. The zoom stays within 5%–1600%.
   */
  function gesture(point: Point, factor: number, degrees: number, dx = 0, dy = 0) {
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
  }

  /** A pointer position in sheet pixels, with the pen's pressure. */
  function sample(event: PointerEvent): StrokePoint {
    const point = toSheet({ x: event.clientX, y: event.clientY });
    return { ...point, pressure: event.pointerType === 'pen' ? Math.max(0.05, event.pressure) : 1 };
  }

  function toSheet(point: Point): Point {
    const { x, y, scale, angle, flipped } = view();
    const local = rotate({ x: point.x - innerWidth / 2 - x, y: point.y - innerHeight / 2 - y }, -angle);
    return { x: local.x / (flipped ? -scale : scale) + sheet.width / 2, y: local.y / scale + sheet.height / 2 };
  }

  /**
   * Where a stroke's segments go: erasing strokes cut their layer directly; others draw opaque into `buffer`, which is
   * composited at the stroke's opacity when it ends.
   */
  function drawingContext(stroke: Stroke, buffer: HTMLCanvasElement) {
    const target = stroke.erase ? canvases.get(stroke.layer)! : buffer;
    const context = target.getContext('2d')!;
    context.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
    context.globalAlpha = stroke.erase ? stroke.opacity / 100 : 1;
    context.filter = 'none';
    return context;
  }

  /** Redraws a layer from scratch: its starting artwork or copied pixels, then its remaining strokes. */
  function replay(id: LayerId) {
    const canvas = canvases.get(id);
    if (!canvas) {
      return;
    }

    if (!work) {
      work = document.createElement('canvas');
      work.width = sheet.width;
      work.height = sheet.height;
    }

    const context = canvas.getContext('2d')!;
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;
    context.filter = 'none';
    context.clearRect(0, 0, sheet.width, sheet.height);
    const copy = copies.get(id);
    if (copy) {
      context.drawImage(copy, 0, 0);
    } else {
      paintStillLife(context, id, sheet);
    }

    for (const stroke of done.filter((entry) => entry.layer === id)) {
      const target = drawingContext(stroke, work);
      stroke.points.forEach((point, index) => drawSegment(target, stroke, stroke.points[index - 1] ?? point, point));
      if (!stroke.erase) {
        composite(canvas, work, stroke);
      }
    }

    touched(id);
  }
}

/** The drawing's state and commands. */
export type SketchCanvas = ReturnType<typeof createSketchCanvas>;

/** A layer's identity. */
export type LayerId = string;

/** A layer as the panels show it; `opacity` is 0–100. */
export type Layer = {
  id: LayerId;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend: BlendMode;
};

/** Blend modes, by their CSS `mix-blend-mode` names, in Photoshop's order. */
export const blendModes = [
  'normal',
  'darken',
  'multiply',
  'color-burn',
  'lighten',
  'screen',
  'color-dodge',
  'overlay',
  'soft-light',
  'hard-light',
  'difference',
  'hue',
  'saturation',
  'color',
  'luminosity'
] as const;

export type BlendMode = (typeof blendModes)[number];

/** A blend mode's name as painting programs print it: "Color dodge". */
export function blendLabel(mode: BlendMode) {
  const words = mode.replace('-', ' ');
  return words[0]!.toUpperCase() + words.slice(1);
}

/** What a new stroke paints with. Size is a diameter in sheet pixels; opacity and hardness are 0–100; smoothing is 0–1. */
export type Brush = {
  erase: boolean;
  color: string;
  size: number;
  opacity: number;
  hardness: number;
  smoothing: number;
  /** Pen pressure scales the diameter. */
  pressureSize: boolean;
  /** Also paints the stroke mirrored across the sheet's vertical middle. */
  mirror: boolean;
};

/**
 * Where the sheet sits: its center's offset from the window's center in CSS pixels, its scale, its angle in degrees
 * clockwise and whether it is mirrored horizontally (before rotating).
 */
export type View = { x: number; y: number; scale: number; angle: number; flipped: boolean };

export type Point = { x: number; y: number };

type StrokePoint = Point & { pressure: number };
type Stroke = Brush & { layer: LayerId; points: StrokePoint[] };
type Rgb = [number, number, number];

/** Sheet size in pixels: small enough that a few layers stay cheap on a tablet. */
const sheet = { width: 1600, height: 1100 };

const startingLayers: readonly Layer[] = [
  { id: 'light', name: 'Highlights', visible: true, locked: false, opacity: 80, blend: 'screen' },
  { id: 'ink', name: 'Ink', visible: true, locked: false, opacity: 100, blend: 'normal' },
  { id: 'shade', name: 'Shadows', visible: true, locked: false, opacity: 65, blend: 'multiply' },
  { id: 'flats', name: 'Flat colors', visible: true, locked: false, opacity: 100, blend: 'normal' },
  { id: 'sketch', name: 'Sketch', visible: false, locked: false, opacity: 45, blend: 'multiply' },
  { id: 'paper', name: 'Paper', visible: true, locked: true, opacity: 100, blend: 'normal' }
];

function windowCenter(): Point {
  return { x: innerWidth / 2, y: innerHeight / 2 };
}

function fittedView(): View {
  const scale = Math.min(innerWidth / sheet.width, innerHeight / sheet.height) * 0.9;
  return { x: 0, y: 0, scale, angle: 0, flipped: false };
}

function rotate(point: Point, degrees: number) {
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

/** Strokes one round-capped segment, and its mirror image for symmetric strokes; a zero-length segment draws a dot. */
function drawSegment(target: CanvasRenderingContext2D, stroke: Stroke, from: StrokePoint, to: StrokePoint) {
  target.lineCap = 'round';
  target.lineJoin = 'round';
  target.strokeStyle = stroke.erase ? '#000' : stroke.color;
  target.lineWidth = Math.max(0.5, stroke.size * (stroke.pressureSize ? to.pressure : 1));
  target.beginPath();
  target.moveTo(from.x, from.y);
  target.lineTo(to.x, to.y);
  if (stroke.mirror) {
    target.moveTo(sheet.width - from.x, from.y);
    target.lineTo(sheet.width - to.x, to.y);
  }

  target.stroke();
}

/** Draws the opaque stroke from `buffer` into its layer at the stroke's opacity and softness, then clears `buffer`. */
function composite(layer: HTMLCanvasElement, buffer: HTMLCanvasElement, stroke: Stroke) {
  const target = layer.getContext('2d')!;
  target.globalCompositeOperation = 'source-over';
  target.globalAlpha = stroke.opacity / 100;
  const blur = softness(stroke);
  target.filter = blur > 0.3 ? `blur(${blur}px)` : 'none';
  target.drawImage(buffer, 0, 0);
  target.filter = 'none';
  target.globalAlpha = 1;
  buffer.getContext('2d')!.clearRect(0, 0, sheet.width, sheet.height);
}

function snapshot(source: HTMLCanvasElement) {
  const copy = document.createElement('canvas');
  copy.width = source.width;
  copy.height = source.height;
  copy.getContext('2d')!.drawImage(source, 0, 0);
  return copy;
}

/** A layer's color over the one below in a blend mode; modes the eyedropper does not model blend as normal. */
function blendChannels(below: Rgb, top: Rgb, mode: BlendMode): Rgb {
  const each = (f: (b: number, t: number) => number) => below.map((b, index) => f(b, top[index]!)) as Rgb;
  switch (mode) {
    case 'multiply':
      return each((b, t) => b * t);
    case 'screen':
      return each((b, t) => 1 - (1 - b) * (1 - t));
    case 'darken':
      return each(Math.min);
    case 'lighten':
      return each(Math.max);
    case 'overlay':
      return each((b, t) => (b < 0.5 ? 2 * b * t : 1 - 2 * (1 - b) * (1 - t)));
    case 'difference':
      return each((b, t) => Math.abs(b - t));
    default:
      return top;
  }
}
