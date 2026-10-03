import type { Point } from '@app-game/paint-core/camera';
import type { Result } from 'neverthrow';
import { createSignal, getOwner, isDisposed } from 'solid-js';
import type { PaintError } from '../../shared/errors';

/**
 * Picks the foreground color from the canvas as displayed, all layers and the paper included: Alt/Option-click with a
 * painting tool, as in Photoshop, or the next contact after `arm()`, for tablets and touch. Must be created within a
 * Solid owner; a color arriving after disposal is dropped.
 */
export function createCanvasColorPicker(options: {
  /** Whether the active tool paints color, so Alt/Option-click samples instead of painting. */
  paints: () => boolean;
  /** Converts a document point to CSS pixels of the canvas. */
  toScreen: (point: Point) => Point;
  /** Reads the displayed color at a canvas point; see `PaintEngine.pickColor`. */
  pick: (point: Point) => Promise<Result<string, PaintError>>;
  /** Receives the picked `#rrggbb` color. */
  apply: (color: string) => void;
  onError: (error: PaintError) => void;
}) {
  const owner = getOwner()!;
  const [armed, setArmed] = createSignal(false);

  return {
    /** The next canvas contact picks a color instead of painting. */
    armed,
    arm: () => setArmed(true),
    cancel: () => setArmed(false),
    /** Canvas contact handler for `attachInput`. */
    canvasAction: {
      enabled: (event: Pick<PointerEvent, 'altKey'>) => armed() || (event.altKey && options.paints()),
      async run(point: Point) {
        setArmed(false);
        const picked = await options.pick(options.toScreen(point));
        if (isDisposed(owner)) {
          return;
        }

        if (picked.isErr()) {
          options.onError(picked.error);
          return;
        }

        options.apply(picked.value);
      }
    }
  };
}
