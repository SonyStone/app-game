import { createEventListener } from '@solid-primitives/event-listener';
import type { Accessor } from 'solid-js';

/**
 * Keeps `data-pointer` on `target` set to the type of the pointer that last entered or pressed inside it: `mouse`,
 * `pen` or `touch`. Styles exclude `[data-pointer='touch'] *` from `:hover`, because iPad Safari leaves a tapped
 * button in `:hover` until the next tap elsewhere. A media query cannot tell these apart: Android tablets report
 * `hover: none` and `any-hover: none` although their pens hover. Listens in the capture phase, so handlers that stop
 * propagation do not hide a pointer. Must be created within a Solid owner; follows `target` when it changes.
 */
export function createPointerTypeAttribute(target: Accessor<HTMLElement | undefined>) {
  const mark = (event: PointerEvent) => {
    const element = target();
    if (element && element.dataset.pointer !== event.pointerType) {
      element.dataset.pointer = event.pointerType;
    }
  };

  createEventListener(target, ['pointerover', 'pointerdown'], mark, { capture: true, passive: true });
}
