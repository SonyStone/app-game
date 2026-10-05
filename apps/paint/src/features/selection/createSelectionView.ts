import type { PaintCommand } from '@app-game/paint-core/protocol';
import type { SelectionPreview } from '@app-game/paint-core/selectionMask';
import { createMediaQuery } from '@solid-primitives/media';
import { createPageVisibility } from '@solid-primitives/page-utilities';
import { createEffect, type Accessor } from 'solid-js';

/**
 * Shows the selection outline on the canvas: tells the engine, whenever it becomes ready and after every change, which
 * gesture to show before it applies, and to hide the outline while `hidden`, as while a transform box stands in for
 * it. The marching-ants animation stops while the page is hidden or the user prefers reduced motion. Must be created
 * within a Solid owner.
 */
export function createSelectionView(options: {
  preview: Accessor<SelectionPreview | undefined>;
  hidden: Accessor<boolean>;
  ready: Accessor<boolean>;
  send: (command: Extract<PaintCommand, { type: 'selection-view' }>) => void;
}) {
  const reducedMotion = createMediaQuery('(prefers-reduced-motion: reduce)');
  const visible = createPageVisibility();

  createEffect(
    () =>
      options.ready()
        ? {
            animate: !reducedMotion() && visible(),
            preview: options.hidden() ? ({ kind: 'hidden' } as const) : options.preview()
          }
        : undefined,
    (view) => {
      if (view) {
        options.send({
          type: 'selection-view',
          animate: view.animate,
          ...(view.preview ? { preview: view.preview } : {})
        });
      }
    }
  );
}
