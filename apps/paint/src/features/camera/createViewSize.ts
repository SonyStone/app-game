import type { ViewSize } from '@app-game/paint-core/camera';
import { createElementSize } from '@solid-primitives/resize-observer';
import { createMemo, type Accessor } from 'solid-js';

/**
 * Tracks the CSS size of the drawing stage, which the canvas fills, with a ResizeObserver; 1×1 until the stage is
 * mounted. Must be created within a Solid owner; observation stops when it is disposed or the stage is removed.
 */
export function createViewSize(stage: Accessor<HTMLElement | undefined>): Accessor<ViewSize> {
  const element = createElementSize(stage);
  return createMemo(() => ({ width: element.clientWidth ?? 1, height: element.clientHeight ?? 1 }), {
    equals: (a, b) => a.width === b.width && a.height === b.height
  });
}
