import { createEventListener } from '@solid-primitives/event-listener';
import { createPointerListeners } from '@solid-primitives/pointer';
import { createEffect, createSignal, onCleanup, untrack, type Accessor } from 'solid-js';

/** One captured pointer with simultaneous horizontal and vertical displacement. */
export function createFreeDrag(options: {
  target: Accessor<HTMLElement | undefined>;
  accepts: (target: EventTarget | null) => boolean;
  /** Called before the first displacement is published, so painted positions can be sampled. */
  onStart: (target: EventTarget | null) => void;
  /** Runs before resetting coordinates. Cancellation must restore the prior selection. */
  onFinish: (result: { x: number; y: number; cancelled: boolean }) => void;
}) {
  const [position, setPosition] = createSignal({ x: 0, y: 0 });
  const [dragging, setDragging] = createSignal(false);
  let pointer:
    | { id: number; x: number; y: number; origin: EventTarget | null; element: HTMLElement; captured: boolean }
    | undefined;
  let suppressClick = false;

  function reset() {
    const previous = pointer;
    pointer = undefined;
    if (previous?.captured && previous.element.hasPointerCapture(previous.id))
      previous.element.releasePointerCapture(previous.id);
    setDragging(false);
    setPosition({ x: 0, y: 0 });
  }

  function finish(cancelled: boolean, x = position().x, y = position().y) {
    if (pointer?.captured) options.onFinish({ x, y, cancelled });
    reset();
  }

  createPointerListeners({
    target: () => (options.target() && typeof document !== 'undefined' ? document : undefined),
    passive: false,
    onDown(event) {
      const element = options.target();
      if (
        !element ||
        !event.isPrimary ||
        event.button !== 0 ||
        !(event.target instanceof Node) ||
        !element.contains(event.target) ||
        !options.accepts(event.target)
      )
        return;
      finish(true);
      event.preventDefault();
      suppressClick = false;
      pointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        origin: event.target,
        element,
        captured: false
      };
    },
    onMove(event) {
      if (!pointer || pointer.id !== event.pointerId) return;
      const x = event.clientX - pointer.x;
      const y = event.clientY - pointer.y;
      if (!pointer.captured) {
        if (Math.hypot(x, y) < 6) return;
        pointer.captured = true;
        pointer.element.setPointerCapture(pointer.id);
        options.onStart(pointer.origin);
        setDragging(true);
        suppressClick = true;
      }
      event.preventDefault();
      setPosition({ x, y });
    },
    onUp(event) {
      if (pointer?.id === event.pointerId) finish(false, event.clientX - pointer.x, event.clientY - pointer.y);
    },
    onCancel(event) {
      if (pointer?.id === event.pointerId) finish(true);
    },
    onLostCapture(event) {
      if (pointer?.id === event.pointerId && event.target === pointer.element) finish(true);
    }
  });
  createEventListener(
    options.target,
    'click',
    (event) => {
      if (!suppressClick || event.detail === 0) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    { capture: true }
  );
  createEffect(options.target, () => untrack(() => finish(true)));
  onCleanup(reset);
  return { position, dragging, startTarget: () => pointer?.origin ?? null };
}
