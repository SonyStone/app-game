import { pixelGridZoom } from '@app-game/paint-core/gpu/pixelGrid';
import type { PaintCommand } from '@app-game/paint-core/protocol';
import { createEffect, type Accessor } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';

/**
 * How the canvas shows pixels up close, remembered in `localStorage`: `smoothPixels` blends magnified pixels into each
 * other instead of drawing them as flat squares (off by default, as image editors show them), and `pixelGrid` outlines
 * each pixel from `pixelGridZoom` on (on by default), drawn by the engine with each frame. Sends both to the engine
 * whenever it becomes ready and after every change. Storage failures keep the choices for this session. Must be created within a Solid
 * owner.
 */
export function createViewOptions(options: {
  /** Whether the engine accepts commands. */
  ready: Accessor<boolean>;
  send: (command: Extract<PaintCommand, { type: 'pixel-view' }>) => void;
}) {
  const [, setStored, stored] = createImmediateSignal(read());

  createEffect(
    () => (options.ready() ? stored() : undefined),
    (view) => {
      if (view) {
        options.send({ type: 'pixel-view', smooth: view.smoothPixels, grid: view.pixelGrid });
      }
    }
  );

  return {
    settings: stored,
    /** Changes view options and remembers them. */
    update(patch: Partial<ViewOptions>) {
      const next = { ...stored(), ...patch };
      setStored(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Keep the choices for this session.
      }
    }
  };
}

/** The canvas view options; see {@link createViewOptions}. */
export type ViewOptions = { smoothPixels: boolean; pixelGrid: boolean };

/** Zoom, in CSS pixels per document pixel, from which the pixel grid shows. */
export { pixelGridZoom };

function read(): ViewOptions {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<Record<keyof ViewOptions, unknown>>;
    return { smoothPixels: stored.smoothPixels === true, pixelGrid: stored.pixelGrid !== false };
  } catch {
    return { smoothPixels: false, pixelGrid: true };
  }
}

const storageKey = 'paint.viewOptions';
