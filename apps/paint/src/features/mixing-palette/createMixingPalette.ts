import { createEventListener } from '@solid-primitives/event-listener';
import { createEffect, createSignal, onCleanup } from 'solid-js';
import { readPalette, writePalette } from './paletteStorage';
import { clearSurface, createSurface, isBlank, union, type Dirty, type PaletteSurface } from './paletteSurface';

/**
 * The mixing palette's paint and its persistence, apart from the panel that shows it, so the paint survives the
 * panel collapsing: the surface of {@link paletteWidth} × {@link paletteHeight} pixels, restored from IndexedDB and
 * saved shortly after each change and when the page hides. A bound canvas shows the surface; changes reported
 * through `changed` are drawn on the next animation frame. Must be created within a Solid owner; disposal saves
 * pending changes.
 */
export function createMixingPalette() {
  const surface = createSurface(paletteWidth, paletteHeight);
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  const [blank, setBlank] = createSignal(true);
  /** The paint wiped by the last Clean, until new paint goes on. */
  const [wiped, setWiped] = createSignal<Uint8ClampedArray>();
  const [loaded, setLoaded] = createSignal(false);
  let pending: Dirty | undefined;
  let frame = 0;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let unsaved = false;

  void readPalette(paletteWidth, paletteHeight).then((data) => {
    // Paint put on before the stored palette arrived wins.
    if (data && !unsaved) {
      surface.data.set(data);
      setBlank(isBlank(surface));
    }

    setLoaded(true);
    redraw({ x: 0, y: 0, width: paletteWidth, height: paletteHeight });
  });
  // A new canvas starts empty: draw everything on it.
  createEffect(canvas, (element) => {
    if (element) {
      redraw({ x: 0, y: 0, width: paletteWidth, height: paletteHeight });
    }
  });
  const saveNow = () => {
    clearTimeout(saveTimer);
    if (unsaved && loaded()) {
      unsaved = false;
      void writePalette(surface);
    }
  };
  createEventListener(window, 'pagehide', saveNow);
  onCleanup(() => {
    cancelAnimationFrame(frame);
    saveNow();
  });

  return {
    surface,
    /** Binds the canvas that shows the palette; its size in pixels must be the surface's. */
    setCanvas,
    /** The palette has no paint. */
    blank,
    /** Reports paint changed within `dirty`: redraws it and saves soon. */
    changed(dirty: Dirty) {
      if (dirty.width === 0 || dirty.height === 0) {
        return;
      }

      if (blank()) {
        setBlank(false);
      }

      setWiped(undefined);
      redraw(dirty);
      unsaved = true;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveNow, saveDelay);
    },
    /** Wipes the palette clean; `restore` brings the paint back until new paint goes on. */
    clean() {
      if (blank()) {
        return;
      }

      setWiped(surface.data.slice());
      redraw(clearSurface(surface));
      setBlank(true);
      unsaved = true;
      saveNow();
    },
    /** The last Clean can be taken back. */
    canRestore: () => wiped() !== undefined,
    restore() {
      const data = wiped();
      if (!data) {
        return;
      }

      surface.data.set(data);
      setWiped(undefined);
      setBlank(isBlank(surface));
      redraw({ x: 0, y: 0, width: paletteWidth, height: paletteHeight });
      unsaved = true;
      saveNow();
    }
  };

  /** Draws `dirty` on the next animation frame, together with other changes until then. */
  function redraw(dirty: Dirty) {
    pending = pending ? union(pending, dirty) : dirty;
    if (!frame) {
      frame = requestAnimationFrame(draw);
    }
  }

  function draw() {
    frame = 0;
    const element = canvas();
    const area = pending;
    pending = undefined;
    const context = element?.getContext('2d');
    if (!context || !area) {
      return;
    }

    context.putImageData(image(surface), 0, 0, area.x, area.y, area.width, area.height);
  }
}

/** The mixing palette's paint; see `createMixingPalette`. */
export type MixingPaletteState = ReturnType<typeof createMixingPalette>;

/** The palette's size in pixels: 3:4, about 1.5 pixels per CSS pixel of the panel. */
export const paletteWidth = 360;
export const paletteHeight = 480;

/** Milliseconds after the last change before the palette is saved. */
const saveDelay = 800;

/** An `ImageData` over the surface's own pixels, made once per surface. */
function image(surface: PaletteSurface) {
  let data = images.get(surface);
  if (!data) {
    data = new ImageData(surface.data as Uint8ClampedArray<ArrayBuffer>, surface.width, surface.height);
    images.set(surface, data);
  }

  return data;
}

const images = new WeakMap<PaletteSurface, ImageData>();
