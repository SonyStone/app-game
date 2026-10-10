import { createEventListener } from '@solid-primitives/event-listener';
import type { Accessor } from 'solid-js';

/**
 * Palm rejection for the interface around the canvas: while a pen is in use (hovering or touching, as recently as
 * {@link penWindow} ms ago), a finger's press on an element inside `target` marked `data-chrome` is a resting palm,
 * so it and the click it would make are swallowed. Finger presses on the canvas are left to the canvas, and a finger
 * works normally again once the pen has left. Must be created within a Solid owner.
 */
export function createPalmGuard(target: Accessor<HTMLElement | Document | undefined>) {
  let penSeen = -Infinity;
  /** Clicks of a swallowed palm press are swallowed until then. */
  let swallowUntil = -Infinity;

  createEventListener(
    window,
    ['pointerover', 'pointermove', 'pointerdown', 'pointerup'],
    (event) => {
      if (event.pointerType === 'pen') {
        penSeen = event.timeStamp;
      }
    },
    { capture: true, passive: true }
  );
  createEventListener(
    target,
    'pointerdown',
    (event) => {
      if (
        event.pointerType === 'touch' &&
        event.timeStamp - penSeen < penWindow &&
        event.target instanceof Element &&
        event.target.closest('[data-chrome]')
      ) {
        event.preventDefault();
        event.stopPropagation();
        swallowUntil = event.timeStamp + clickWindow;
      }
    },
    { capture: true }
  );
  createEventListener(
    target,
    'click',
    (event) => {
      if (event.timeStamp < swallowUntil && (event as PointerEvent).pointerType === 'touch') {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    { capture: true }
  );
}

/** Milliseconds after the pen's last event during which a finger on the interface counts as a palm. */
const penWindow = 400;

/** Milliseconds after a swallowed palm press during which its click is swallowed too. */
const clickWindow = 1000;
