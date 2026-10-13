// @vitest-environment jsdom
import { createRoot, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createHoverHints } from './createHoverHints';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  vi.useRealTimers();
});

it('hides the hint at a press anywhere, when the leaving never comes', () => {
  vi.useFakeTimers();
  const hints = createRoot((disposeRoot) => {
    dispose = disposeRoot;
    return createHoverHints<'transform'>();
  });
  const button = document.createElement('button');
  const enter = { pointerType: 'pen', currentTarget: button } as unknown as Parameters<
    ReturnType<typeof hints.on>['onPointerEnter']
  >[0];
  hints.on('transform').onPointerEnter(enter);
  vi.advanceTimersByTime(400);
  flush();
  expect(hints.shown()?.id).toBe('transform');

  document.body.dispatchEvent(pointer('pointerdown'));
  flush();
  expect(hints.shown()).toBeUndefined();
});

/** A pen event; jsdom has no PointerEvent constructor, so a MouseEvent carries `pointerType`. */
function pointer(type: string) {
  return Object.assign(new MouseEvent(type, { bubbles: true }), { pointerType: 'pen' });
}
