// @vitest-environment jsdom
import { createRoot, flush } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPalmRejection } from './createPalmRejection';

let dispose: (() => void) | undefined;
let seen: string[];
const record = (event: Event) => seen.push(`${(event as PointerEvent).pointerType} ${event.type}`);

beforeEach(() => {
  vi.useFakeTimers();
  seen = [];
  // A left hand: touches left of the pen, up to 100 px short of it, are the palm.
  createRoot((disposeRoot) => {
    dispose = disposeRoot;
    createPalmRejection({ enabled: () => true, hand: () => 'left', tolerance: () => -100, linger: () => 200 });
  });
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'click']) {
    document.body.addEventListener(type, record);
  }
});

afterEach(() => {
  dispose?.();
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'click']) {
    document.body.removeEventListener(type, record);
  }
  vi.useRealTimers();
});

it('ignores a touch on the pen hand side while the pen is near, until it lifts', () => {
  pointer('pointermove', 'pen', 500);
  pointer('pointerdown', 'touch', 300, 1);
  // The pen goes away, but the palm stays ignored until it lifts, click included.
  vi.advanceTimersByTime(1000);
  flush();
  pointer('pointermove', 'touch', 600, 1);
  pointer('pointerup', 'touch', 600, 1);
  pointer('click', 'touch', 600);

  expect(seen).toEqual(['pen pointermove']);
});

it('passes touches on the free hand side, within the tolerance, and after the pen lingers out', () => {
  pointer('pointermove', 'pen', 500);
  pointer('pointerdown', 'touch', 450, 1);
  pointer('pointerdown', 'touch', 800, 2);
  vi.advanceTimersByTime(250);
  flush();
  pointer('pointerdown', 'touch', 100, 3);

  expect(seen).toEqual(['pen pointermove', 'touch pointerdown', 'touch pointerdown', 'touch pointerdown']);
});

it('keeps the pen near for the linger after a lift that reports leaving, as on screens without hover', () => {
  pointer('pointerdown', 'pen', 500);
  pointer('pointerup', 'pen', 500);
  pointer('pointerout', 'pen', 500);
  pointer('pointerdown', 'touch', 300, 1);
  vi.advanceTimersByTime(250);
  flush();
  pointer('pointerdown', 'touch', 300, 2);

  expect(seen).toEqual(['pen pointerdown', 'pen pointerup', 'touch pointerdown']);
});

it('stops guarding at once when a hovering pen leaves', () => {
  pointer('pointermove', 'pen', 500);
  pointer('pointerout', 'pen', 500);
  pointer('pointerdown', 'touch', 300, 1);

  expect(seen).toEqual(['pen pointermove', 'touch pointerdown']);
});

/**
 * Dispatches a pointer event and settles signals, as the browser's microtask checkpoint does between events. jsdom has
 * no PointerEvent constructor, so a MouseEvent carries `pointerType` and `pointerId`.
 */
function pointer(type: string, pointerType: string, clientX: number, pointerId = 0) {
  document.body.dispatchEvent(
    Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX }), { pointerType, pointerId })
  );
  flush();
}
