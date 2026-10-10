import { encodeDocument, snapshotDocument } from '@app-game/paint-core/storage';
import { defaultCamera } from '@app-game/paint-core/camera';
import { createEffect } from 'solid-js';
import type { PaintSession } from '../../features/session';

/**
 * The prepared start of a feature demo. When the demo's drawing is empty on the first ready engine, and on every
 * `reset`, the drawing is replaced by a blank one carrying `features` (document feature data by feature ID, such as
 * symmetry settings), and the `seed` image, if any, is placed on it as a layer. A drawing the user already worked on
 * is left as it is until they start over. Must be created within a Solid owner.
 */
export function createDemoStart(
  session: PaintSession,
  options: {
    features?: Readonly<Record<string, unknown>>;
    /** Draws the starting picture, such as line art to fill. */
    seed?: () => Promise<File>;
  }
) {
  let started = false;

  createEffect(
    () => session.ready(),
    (ready) => {
      if (!ready || started) {
        return;
      }

      started = true;
      if (session.engine.state().tileCount === 0) {
        reset();
      }
    }
  );

  return { reset };

  /** Replaces the drawing with the demo's start; undo cannot bring the previous drawing back. */
  function reset() {
    session.edit({ type: 'import', text: blankDrawing(options.features ?? {}) });
    // The engine runs commands in order, so the image lands on the blank drawing.
    void options.seed?.().then((file) => session.images.place(file));
  }
}

/** A portable drawing with one empty layer, the camera at the origin and `features`. */
function blankDrawing(features: Readonly<Record<string, unknown>>) {
  const layer = { id: 'layer-1', name: 'Layer 1', visible: true, opacity: 1, blend: 'normal' as const, tiles: new Map() };
  return encodeDocument(snapshotDocument([layer], layer.id, defaultCamera(), features));
}
