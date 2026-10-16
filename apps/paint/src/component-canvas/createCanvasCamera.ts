import { createSignal, onCleanup } from 'solid-js';

/**
 * The component canvas's camera: where the world is on screen (`x`, `y` in CSS pixels) and its `zoom`. Writes the
 * world element's transform at most once per animation frame, however often gestures move it, and remembers the
 * camera in `localStorage` a moment after it stops moving. Without a remembered camera, or with one that is malformed,
 * the canvas starts fitted (see `fit`). Must be created within a Solid owner.
 */
export function createCanvasCamera(options: {
  /** The element the camera moves; its transform origin must be its top left corner. */
  world: () => HTMLElement | undefined;
  /** The visible area, in CSS pixels. */
  viewport: () => { width: number; height: number };
}) {
  const stored = read();
  let current: Camera = stored ?? { x: 0, y: 0, zoom: 1 };
  let frame: number | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  /** The zoom shown in the canvas's panel; follows the camera once per frame. */
  const [zoom, setZoom] = createSignal(current.zoom);

  onCleanup(() => {
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
    }

    clearTimeout(saveTimer);
  });

  const move = (next: Camera) => {
    current = { x: next.x, y: next.y, zoom: clampZoom(next.zoom) };
    frame ??= requestAnimationFrame(apply);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, saveDelayMs, current);
  };

  return {
    /** The camera now, including moves not yet drawn. */
    current: () => current,
    /** The zoom, for showing; updated once per frame. */
    zoom,
    /** Whether a camera was remembered from an earlier visit, so that the canvas should not fit itself. */
    remembered: stored !== undefined,
    /** Draws the camera at once, e.g. after mounting. */
    apply,
    /** Moves the world by `dx`, `dy` CSS pixels. */
    panBy(dx: number, dy: number) {
      move({ ...current, x: current.x + dx, y: current.y + dy });
    },
    /** Scales by `factor` around the screen point `at`, which keeps showing the same world point. */
    zoomAt(at: { x: number; y: number }, factor: number) {
      const zoom = clampZoom(current.zoom * factor);
      const ratio = zoom / current.zoom;
      move({ x: at.x - (at.x - current.x) * ratio, y: at.y - (at.y - current.y) * ratio, zoom });
    },
    /** Sets the camera directly, e.g. from a pinch that tracks its start. */
    set: move,
    /**
     * Shows the world rectangle `area` (world CSS pixels) whole and centered, with `margin` screen pixels around it,
     * at no more than `maxZoom` (1: never larger than in the app).
     */
    show(area: { x: number; y: number; width: number; height: number }, margin = 48, maxZoom = 1) {
      const view = options.viewport();
      const zoom = clampZoom(
        Math.min(
          maxZoom,
          (view.width - margin * 2) / Math.max(1, area.width),
          (view.height - margin * 2) / Math.max(1, area.height)
        )
      );
      move({
        x: view.width / 2 - (area.x + area.width / 2) * zoom,
        y: view.height / 2 - (area.y + area.height / 2) * zoom,
        zoom
      });
    }
  };

  function apply() {
    frame = undefined;
    const world = options.world();
    if (world) {
      world.style.transform = `translate(${current.x}px, ${current.y}px) scale(${current.zoom})`;
    }

    setZoom(current.zoom);
  }
}

/** Where the world is on screen: its top left corner at `x`, `y` CSS pixels, scaled by `zoom`. */
export type Camera = { x: number; y: number; zoom: number };

/** Zoom limits: 10 % shows the whole canvas, 400 % a component's details. */
export const minZoom = 0.1;
export const maxZoom = 4;

function clampZoom(zoom: number) {
  return Math.min(maxZoom, Math.max(minZoom, zoom));
}

/** The remembered camera, or `undefined` when there is none or it is malformed or from another format. */
function read(): Camera | undefined {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as unknown;
    if (typeof stored !== 'object' || stored === null) {
      return undefined;
    }

    const { version, x, y, zoom } = stored as Record<string, unknown>;
    if (version !== storageVersion || !isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(zoom)) {
      return undefined;
    }

    // A camera that lost the world far off screen is no better than none.
    if (Math.abs(x) > maxOffset || Math.abs(y) > maxOffset) {
      return undefined;
    }

    return { x, y, zoom: clampZoom(zoom) };
  } catch {
    return undefined;
  }
}

function save(camera: Camera) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ version: storageVersion, ...camera }));
  } catch {
    // The camera is a convenience; keep it for this visit.
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

const storageKey = 'paint.componentCanvas.camera';
const storageVersion = 1;
const saveDelayMs = 400;
const maxOffset = 1_000_000;
