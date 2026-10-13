import { createEventListener } from '@solid-primitives/event-listener';
import type { Accessor } from 'solid-js';

/**
 * Keeps `data-pointer` on `target` set to the type of the pointer that last entered or pressed inside it: `mouse`,
 * `pen` or `touch`. Styles exclude `[data-pointer='touch'] *` from `:hover`, because iPad Safari leaves a tapped
 * button in `:hover` until the next tap elsewhere. A media query cannot tell these apart: Android tablets report
 * `hover: none` and `any-hover: none` although their pens hover.
 *
 * Also sets `data-hover-stale` from a pen or touch press until a pen or mouse next hovers (moves without buttons),
 * and styles exclude `[data-hover-stale] *` from `:hover` too: Chrome on Android can stop reporting a pen's hover, in a
 * tab moved into or out of an installed app, and then leaves the last hovered button in `:hover` for good.
 *
 * Listens in the capture phase, so handlers that stop propagation do not hide a pointer. Must be created within a
 * Solid owner; follows `target` when it changes.
 */
export function createPointerTypeAttribute(target: Accessor<HTMLElement | undefined>) {
  const mark = (event: PointerEvent) => {
    const element = target();
    if (element && element.dataset.pointer !== event.pointerType) {
      element.dataset.pointer = event.pointerType;
    }
  };

  /** A press ends hovering; only a pen or mouse moving without buttons starts it again. */
  const markHover = (event: PointerEvent) => {
    const element = target();
    if (!element) {
      return;
    }

    if (event.type === 'pointerdown') {
      if (event.pointerType !== 'mouse') {
        element.dataset.hoverStale = '';
      }
    } else if (event.pointerType !== 'touch' && event.buttons === 0 && element.dataset.hoverStale !== undefined) {
      delete element.dataset.hoverStale;
    }
  };

  createEventListener(target, ['pointerover', 'pointerdown'], mark, { capture: true, passive: true });
  createEventListener(target, ['pointerover', 'pointermove', 'pointerdown'], markHover, {
    capture: true,
    passive: true
  });
}
