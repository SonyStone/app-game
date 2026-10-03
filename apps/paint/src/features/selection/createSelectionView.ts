import type { Point } from '@app-game/paint-core/camera';
import type { PaintCommand } from '@app-game/paint-core/protocol';
import { createMediaQuery } from '@solid-primitives/media';
import { createPageVisibility } from '@solid-primitives/page-utilities';
import { createEffect, type Accessor } from 'solid-js';

/**
 * Shows the lasso outline on the canvas: sends it to the engine whenever the engine becomes ready and after every
 * change. The marching-ants animation stops while the page is hidden or the user prefers reduced motion.
 * Must be created within a Solid owner.
 */
export function createSelectionView(options: {
  points: Accessor<Point[]>;
  ready: Accessor<boolean>;
  send: (command: Extract<PaintCommand, { type: 'selection-view' }>) => void;
}) {
  const reducedMotion = createMediaQuery('(prefers-reduced-motion: reduce)');
  const visible = createPageVisibility();

  createEffect(
    () => (options.ready() ? { points: options.points(), animate: !reducedMotion() && visible() } : undefined),
    (view) => {
      if (view) {
        options.send({ type: 'selection-view', ...view });
      }
    }
  );
}
