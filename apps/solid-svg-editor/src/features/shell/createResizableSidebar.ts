import { makePersisted } from '@solid-primitives/storage';
import { createSignal, untrack } from 'solid-js';

import { setPointerCaptureSafely } from '../../editor/pointer';
import { clamp } from '../../editor/tree-utils';

/**
 * Sidebar width driven by a splitter: a primary-button drag resizes within the limits, and a cancelled or lost
 * pointer ends the drag. The width is kept in localStorage so it survives reloads.
 */
export function createResizableSidebar(options: {
  readonly initialWidth: number;
  readonly minWidth: number;
  readonly maxWidth: number;
}) {
  const [width, setWidth] = untrack(() =>
    makePersisted(createSignal(options.initialWidth, { ownedWrite: true }), {
      name: 'solid-svg-editor-sidebar-width',
      deserialize: (data) => clamp(Number(data) || options.initialWidth, options.minWidth, options.maxWidth)
    })
  );
  let resizeStart: { readonly x: number; readonly width: number } | undefined;

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    resizeStart = { x: event.clientX, width: width() };
    setPointerCaptureSafely(event.currentTarget as Element, event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!resizeStart) {
      return;
    }

    setWidth(clamp(resizeStart.width + event.clientX - resizeStart.x, options.minWidth, options.maxWidth));
  }

  /** Ends the drag on release, cancel, or lost capture. */
  function onPointerUp(): void {
    resizeStart = undefined;
  }

  return {
    width,
    onPointerDown,
    onPointerMove,
    onPointerUp
  };
}
