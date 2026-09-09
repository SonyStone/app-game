import { createEventListener } from '@solid-primitives/event-listener';
import { createPointerListeners } from '@solid-primitives/pointer';
import { createEffect, onCleanup, type Accessor } from 'solid-js';

/**
 * Adds mouse/pen grab scrolling to a native vertical scrollport. Touch and wheel
 * remain native, including momentum. Axis locking preserves taps on controls;
 * capture and pending gestures are released when disabled, replaced, or disposed.
 */
export function createDragScroll(target: Accessor<HTMLElement | undefined>, enabled: Accessor<boolean>) {
  let pointer: { id: number; element: HTMLElement; x: number; y: number; top: number; captured: boolean } | undefined;
  let suppressClick = false;
  const reset = () => {
    const previous = pointer;
    pointer = undefined;
    if (previous?.captured && previous.element.hasPointerCapture(previous.id))
      previous.element.releasePointerCapture(previous.id);
  };
  createPointerListeners({
    target,
    pointerTypes: ['mouse', 'pen'],
    passive: false,
    onDown(event) {
      if (!enabled() || !event.isPrimary || event.button !== 0) return;
      reset();
      suppressClick = false;
      const element = target();
      if (!element || element.scrollHeight <= element.clientHeight) return;
      pointer = {
        id: event.pointerId,
        element,
        x: event.clientX,
        y: event.clientY,
        top: element.scrollTop,
        captured: false
      };
    },
    onMove(event) {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dy = event.clientY - pointer.y;
      const dx = event.clientX - pointer.x;
      if (!pointer.captured) {
        if (Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy)) {
          reset();
          return;
        }
        if (Math.abs(dy) < 7) return;
        pointer.captured = true;
        suppressClick = true;
        pointer.element.setPointerCapture(pointer.id);
      }
      event.preventDefault();
      pointer.element.scrollTop = Math.max(
        0,
        Math.min(pointer.element.scrollHeight - pointer.element.clientHeight, pointer.top - dy)
      );
    },
    onUp(event) {
      if (pointer?.id === event.pointerId) reset();
    },
    onCancel(event) {
      if (pointer?.id === event.pointerId) reset();
    },
    onLostCapture(event) {
      if (pointer?.id === event.pointerId && event.target === pointer.element) reset();
    }
  });
  createEventListener(
    target,
    'click',
    (event) => {
      if (!suppressClick || event.detail === 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick = false;
    },
    { capture: true }
  );
  createEffect(() => [target(), enabled()] as const, reset);
  onCleanup(reset);
}
