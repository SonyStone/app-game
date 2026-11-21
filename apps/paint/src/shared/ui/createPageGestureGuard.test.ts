// @vitest-environment jsdom
import { createRoot } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createPageGestureGuard } from './createPageGestureGuard';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  history.replaceState(null, '');
});

it('reports a Back that the guard entry took, and none while the guard is not armed', () => {
  const onBack = vi.fn();
  createRoot((disposer) => {
    dispose = disposer;
    createPageGestureGuard(onBack);
  });

  // Not armed yet: a Back here would leave the page, so nothing is reported.
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  expect(onBack).not.toHaveBeenCalled();

  // A press arms the guard; the Back that leaves its entry is the page's to answer.
  window.dispatchEvent(new Event('pointerdown'));
  expect((history.state as Record<string, unknown>).paintBackGuard).toBe(true);
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  expect(onBack).toHaveBeenCalledTimes(1);

  // Going forward onto the guard entry again is no Back.
  window.dispatchEvent(new PopStateEvent('popstate', { state: { paintBackGuard: true } }));
  expect(onBack).toHaveBeenCalledTimes(1);
});
