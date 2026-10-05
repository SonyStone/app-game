import type { Brush } from '@app-game/paint-core/brush';
import type { Point } from '@app-game/paint-core/camera';
import { createSignal, type Accessor } from 'solid-js';
import { maxBrushSize } from './createBrushTools';

/**
 * Adjusts the brush by dragging on the canvas with Ctrl+Alt (Cmd+Option on a Mac also works), as in Photoshop:
 * dragging right enlarges the brush and left shrinks it, exponentially so that small and very large brushes are equally
 * reachable; dragging up raises the stroke opacity and down lowers it. The drag starts from the brush as it was at
 * contact, so returning to the anchor restores it. Must be created within a Solid owner.
 */
export function createBrushAdjust(options: {
  brush: Accessor<Brush>;
  update: (patch: Partial<Brush>) => void;
  /** Whether the active tool has a brush to adjust; the lasso has none. */
  available: () => boolean;
}) {
  const [anchor, setAnchor] = createSignal<Point>();
  let start: { point: Point; size: number; opacity: number } | undefined;

  return {
    /** Where the drag started, in canvas CSS pixels, while adjusting; the HUD is drawn there. */
    anchor,
    /** Canvas drag handler for `attachInput`. */
    adjust: {
      enabled: (event: Pick<PointerEvent, 'altKey' | 'ctrlKey' | 'metaKey'>) =>
        event.altKey && (event.ctrlKey || event.metaKey) && options.available(),
      begin(point: Point) {
        const { size, opacity } = options.brush();
        start = { point, size, opacity };
        setAnchor(point);
      },
      move(point: Point) {
        if (!start) {
          return;
        }

        const size = start.size * 2 ** ((point.x - start.point.x) / pixelsPerDoubling);
        const opacity = start.opacity - (point.y - start.point.y) / pixelsPerOpacity;
        options.update({
          size: Math.round(Math.min(maxBrushSize(options.brush()), Math.max(1, size))),
          opacity: Math.round(Math.min(1, Math.max(0.01, opacity)) * 100) / 100
        });
      },
      end() {
        start = undefined;
        setAnchor(undefined);
      }
    }
  };
}

/** Horizontal drag, in CSS pixels, that doubles or halves the brush size. */
const pixelsPerDoubling = 120;

/** Vertical drag, in CSS pixels, across the whole opacity range. */
const pixelsPerOpacity = 250;
