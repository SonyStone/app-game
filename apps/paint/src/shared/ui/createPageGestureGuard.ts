import { makeEventListener } from '@solid-primitives/event-listener';
import { onCleanup } from 'solid-js';

/**
 * Keeps page gestures from leaving the drawing while the owner lives. The browser's pull-to-refresh and its overscroll
 * navigation (a sideways swipe back or forward on touch screens and trackpads) are turned off for the document. An
 * Android back gesture or a Back press cannot be turned off, so it lands on an extra history entry of the same page
 * instead, which a press in the page puts back: Chrome skips history entries made without a user action, so the entry
 * waits for one. Two Backs without touching the page in between still leave it. Must be created within a Solid owner,
 * which restores the document's overscroll on disposal.
 */
export function createPageGestureGuard() {
  const elements = [document.documentElement, document.body];
  const previous = elements.map((element) => element.style.overscrollBehavior);
  for (const element of elements) {
    element.style.overscrollBehavior = 'none';
  }

  /** Whether the current history entry is the guard, which a Back would leave for the page's own entry. */
  let armed = isGuard(history.state);
  const arm = () => {
    if (!armed) {
      history.pushState({ ...(history.state as object | null), [guardKey]: true }, '');
      armed = true;
    }
  };
  const stopArming = makeEventListener(window, 'pointerdown', arm, { capture: true, passive: true });
  const stopKeys = makeEventListener(window, 'keydown', arm, { capture: true, passive: true });
  const stopBack = makeEventListener(window, 'popstate', (event) => {
    armed = isGuard(event.state);
  });

  onCleanup(() => {
    stopArming();
    stopKeys();
    stopBack();
    elements.forEach((element, index) => {
      element.style.overscrollBehavior = previous[index]!;
    });
  });
}

/** Marks the history entry the guard pushes. */
const guardKey = 'paintBackGuard';

function isGuard(state: unknown) {
  return typeof state === 'object' && state !== null && (state as Record<string, unknown>)[guardKey] === true;
}
