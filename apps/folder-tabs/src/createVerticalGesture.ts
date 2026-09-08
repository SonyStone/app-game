import { createEventListener } from '@solid-primitives/event-listener';
import { createPointerListeners } from '@solid-primitives/pointer';
import { debounce } from '@solid-primitives/scheduled';
import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js';

/** A completed gesture, including displacement for a continuous release animation. */
export type VerticalGesture = { direction: 'up' | 'down'; offset: number };

/**
 * Captured vertical dragging and one-step wheel gestures on a reactive target.
 * Short/horizontal drags snap back; cancellation never commits. Inputs retain native behavior.
 * `acceptsWheel` lets an embedded horizontal rail handle its own wheel input.
 * `enabled` gates new gestures while a consumer finishes its current transition.
 * `startTarget()` reads the original pointer target during `onCommit`, before capture retargeting.
 * It is a synchronous gesture snapshot, cleared on release/cancel; wheel commits have no target.
 * Owned listeners, capture, and wheel timers are released on replacement or disposal.
 * `pan`/`swipe` omit the live displacement, capture, and cancellation contract needed here.
 */
export function createVerticalGesture(
  target: Accessor<HTMLElement | undefined>,
  onCommit: (gesture: VerticalGesture) => void,
  enabled: Accessor<boolean> = () => true,
  acceptsWheel: (event: WheelEvent) => boolean = () => true
) {
  const [offset, setOffset] = createSignal(0);
  const [dragging, setDragging] = createSignal(false);
  let pointer:
    | {
        id: number;
        x: number;
        y: number;
        time: number;
        element: HTMLElement;
        captured: boolean;
        startTarget: EventTarget | null;
      }
    | undefined;
  let suppressClick = false;
  let wheelLocked = false;
  const finishWheel = debounce(() => {
    wheelLocked = false;
    setOffset(0);
    setDragging(false);
  }, 180);

  function reset() {
    const previous = pointer;
    pointer = undefined;
    // Horizontal and vertical gestures share the element, but not capture ownership.
    if (previous?.captured && previous.element.hasPointerCapture(previous.id))
      previous.element.releasePointerCapture(previous.id);
    setOffset(0);
    setDragging(false);
  }

  function commit(value: number) {
    onCommit({ direction: value > 0 ? 'down' : 'up', offset: value });
    reset();
  }

  createPointerListeners({
    target,
    passive: false,
    onDown(event) {
      if (!enabled() || !event.isPrimary || event.button !== 0 || ignoreTarget(event.target)) return;
      reset();
      finishWheel.clear();
      wheelLocked = false;
      suppressClick = false;
      const element = target();
      if (element)
        pointer = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          time: event.timeStamp,
          element,
          captured: false,
          startTarget: event.target
        };
    },
    onMove(event) {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dy = event.clientY - pointer.y;
      const dx = event.clientX - pointer.x;
      if (!pointer.captured) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          reset();
          return;
        }
        if (Math.abs(dy) < 7 || Math.abs(dy) < Math.abs(dx) * 1.2) return;
        pointer.captured = true;
        pointer.element.setPointerCapture(event.pointerId);
        setDragging(true);
        suppressClick = true;
      }
      event.preventDefault();
      setOffset(dy);
    },
    onUp(event) {
      if (!pointer || pointer.id !== event.pointerId) return;
      const value = offset();
      const velocity = Math.abs(value) / Math.max(1, event.timeStamp - pointer.time);
      const threshold = Math.max(36, Math.min(90, pointer.element.clientHeight * 0.09));
      if (pointer.captured && (Math.abs(value) >= threshold || (Math.abs(value) > 18 && velocity > 0.5))) commit(value);
      else reset();
    },
    onCancel(event) {
      if (pointer?.id === event.pointerId) reset();
    },
    onLostCapture(event) {
      if (pointer?.id === event.pointerId) reset();
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

  createEventListener(
    target,
    'wheel',
    (event) => {
      if (
        !enabled() ||
        !acceptsWheel(event) ||
        pointer ||
        event.ctrlKey ||
        ignoreTarget(event.target) ||
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
      )
        return;
      event.preventDefault();
      finishWheel();
      if (wheelLocked || pointer) return;
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? (target()?.clientHeight ?? 600) : 1;
      // Scroll deltas are opposite to the fingers' vertical motion.
      const value = offset() - event.deltaY * scale;
      setDragging(true);
      setOffset(value);
      if (Math.abs(value) >= 75) {
        wheelLocked = true;
        commit(value);
      }
    },
    { passive: false }
  );

  createEffect(target, () => {
    finishWheel.clear();
    wheelLocked = false;
    reset();
  });
  onCleanup(() => {
    const previous = pointer;
    pointer = undefined;
    // Horizontal and vertical gestures share the element, but not capture ownership.
    if (previous?.captured && previous.element.hasPointerCapture(previous.id))
      previous.element.releasePointerCapture(previous.id);
  });
  return { offset, dragging, startTarget: () => pointer?.startTarget ?? null };
}

/** Editing and search scrolling should never navigate the folder deck. */
function ignoreTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest('input, textarea, select, [contenteditable="true"], .search-panel, .rail-controls'))
  );
}
