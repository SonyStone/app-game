import { createEventListener } from '@solid-primitives/event-listener';
import { createPointerListeners } from '@solid-primitives/pointer';
import { debounce } from '@solid-primitives/scheduled';
import { createEffect, createSignal, onCleanup, untrack, type Accessor } from 'solid-js';
import { dragAxis } from './dragAxis';

/**
 * Horizontal tab scrolling in screen-width units, without moving the attached panels.
 * Native scroll tracking cannot express that shared-wrapper layout. Pointer/listener
 * primitives provide capture and cleanup; the caller animates commands and bounded release drift.
 * `readPainted` samples an interrupted animation so grabbing the rail continues from its visible position.
 * `accepts` defines the swipe surface; `acceptsWheel` can limit wheel input separately.
 */
export function createHorizontalRail(options: {
  target: Accessor<HTMLElement | undefined>;
  enabled: Accessor<boolean>;
  /** Lower scroll bound; negative values allow a stack to pan right from its resting pose. */
  min?: Accessor<number>;
  max: Accessor<number>;
  /** Full visible tab width, in the same units as offset. Defaults to 30. */
  tabWidth?: Accessor<number>;
  accepts: (target: EventTarget | null) => boolean;
  /** Wheel routing can stay limited to the tabs while pointer swipes use the card. */
  acceptsWheel?: (target: EventTarget | null) => boolean;
  readPainted: () => number;
}) {
  const [offset, setOffset] = createSignal(0);
  const [direct, setDirect] = createSignal(false);
  let pointer:
    | {
        id: number;
        element: HTMLElement;
        x: number;
        y: number;
        start: number;
        lastX: number;
        time: number;
        velocity: number;
        moved: boolean;
      }
    | undefined;
  let suppressClick = false;
  const finishWheel = debounce(() => setDirect(false), 140);
  const clamp = (value: number) => Math.max(options.min?.() ?? 0, Math.min(options.max(), value));
  const units = (pixels: number) => (pixels / Math.max(1, options.target()?.clientWidth ?? 1)) * 100;

  /** Smoothly moves the rail to a bounded destination. */
  function scrollTo(value: number) {
    setDirect(false);
    setOffset(clamp(value));
  }

  /** Keeps a full tab inside the viewport, moving only when it is outside the margins. */
  function reveal(left: number) {
    const current = offset();
    const width = options.tabWidth?.() ?? 30;
    if (left < current + 3) scrollTo(left - 3);
    else if (left + width > current + 97) scrollTo(left + width - 97);
  }

  function release(momentum = false) {
    const previous = pointer;
    pointer = undefined;
    if (previous?.moved && previous.element.hasPointerCapture(previous.id))
      previous.element.releasePointerCapture(previous.id);
    setDirect(false);
    if (momentum && previous?.moved)
      setOffset((value) => clamp(value + units(Math.max(-90, Math.min(90, previous.velocity * 100)))));
  }

  createPointerListeners({
    target: () => (options.target() && typeof document !== 'undefined' ? document : undefined),
    passive: false,
    onDown(event) {
      const element = options.target();
      if (!element || !(event.target instanceof Node) || !element.contains(event.target)) return;
      if (!options.enabled() || !event.isPrimary || event.button !== 0 || !options.accepts(event.target)) return;
      release();
      finishWheel.clear();
      suppressClick = false;
      event.preventDefault();
      const start = clamp(options.readPainted());
      pointer = {
        id: event.pointerId,
        element,
        x: event.clientX,
        y: event.clientY,
        start,
        lastX: event.clientX,
        time: event.timeStamp,
        velocity: 0,
        moved: false
      };
      setDirect(true);
      setOffset(start);
    },
    onMove(event) {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      if (!pointer.moved) {
        const axis = dragAxis(dx, dy);
        if (!axis) return;
        if (axis === 'vertical') {
          release();
          return;
        }
        pointer.moved = true;
        suppressClick = true;
        pointer.element.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      pointer.velocity = (pointer.lastX - event.clientX) / Math.max(1, event.timeStamp - pointer.time);
      pointer.lastX = event.clientX;
      pointer.time = event.timeStamp;
      setOffset(clamp(pointer.start - units(dx)));
    },
    onUp(event) {
      if (pointer?.id === event.pointerId) release(event.timeStamp - pointer.time < 100);
    },
    onCancel(event) {
      if (pointer?.id === event.pointerId) release();
    },
    onLostCapture(event) {
      if (pointer?.id === event.pointerId && event.target === pointer.element) release();
    }
  });
  createEventListener(
    options.target,
    'wheel',
    (event) => {
      if (!options.enabled() || pointer || event.ctrlKey || !(options.acceptsWheel ?? options.accepts)(event.target))
        return;
      event.preventDefault();
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? options.target()!.clientWidth : 1;
      // Trackpad momentum is already present in wheel deltas; mouse-wheel steps use the tab motion controller.
      setDirect(Math.abs(event.deltaX) > 0);
      setOffset((value) => clamp(value + units(delta * scale)));
      finishWheel();
    },
    { passive: false }
  );
  createEventListener(
    options.target,
    'click',
    (event) => {
      if (!suppressClick || event.detail === 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick = false;
    },
    { capture: true }
  );
  createEffect(
    () => [options.target(), options.enabled()] as const,
    () => {
      release();
      finishWheel.clear();
    }
  );
  createEffect(options.max, () => {
    setOffset((value) => untrack(() => clamp(value)));
  });
  onCleanup(release);
  return { offset, direct, scrollTo, reveal, scrollBy: (amount: number) => scrollTo(offset() + amount) };
}
