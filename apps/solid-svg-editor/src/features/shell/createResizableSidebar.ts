import { createSignal } from 'solid-js';

import { setPointerCaptureSafely } from '../../editor/pointer';
import { clamp } from '../../editor/tree-utils';

export function createResizableSidebar(options: {
  readonly initialWidth: number;
  readonly minWidth: number;
  readonly maxWidth: number;
}) {
  const [width, setWidth] = createSignal(options.initialWidth);
  let resizeStart: { readonly x: number; readonly width: number } | undefined;

  function onPointerDown(event: PointerEvent): void {
    resizeStart = { x: event.clientX, width: width() };
    setPointerCaptureSafely(event.currentTarget as Element, event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!resizeStart) {
      return;
    }

    setWidth(clamp(resizeStart.width + event.clientX - resizeStart.x, options.minWidth, options.maxWidth));
  }

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
