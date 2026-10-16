// @vitest-environment jsdom
import { createRoot, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createStepBack, spread, stepBackProgress } from './createStepBack';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

it('leaves two fingers to the content', () => {
  const { moves, stepBack, touch } = mount();
  touch('pointerdown', 1, 100, 100);
  touch('pointerdown', 2, 300, 100);
  touch('pointermove', 2, 200, 100);
  expect(moves()).toBe(1);
  expect(stepBack.progress()).toBeUndefined();
});

it('takes over at the third finger: undoes what the first ones did, follows the pinch and opens past half way', () => {
  const restore = vi.fn();
  const onCommit = vi.fn();
  const { moves, stepBack, touch } = mount({ snapshot: () => restore, onCommit });
  touch('pointerdown', 1, 0, 0);
  touch('pointerdown', 2, 200, 0);
  touch('pointermove', 2, 210, 0);
  touch('pointerdown', 3, 100, 200);
  expect(restore).toHaveBeenCalledOnce();
  expect(stepBack.progress()).toBe(0);

  const before = moves();
  // Every finger halfway to the center: the spread halves, past `pinchDepth`.
  touch('pointermove', 1, 50, 50);
  touch('pointermove', 2, 155, 50);
  touch('pointermove', 3, 100, 125);
  expect(moves()).toBe(before);
  expect(stepBack.progress()).toBe(1);
  expect(stepBack.pinched()).toBe(true);

  touch('pointerup', 3, 100, 125);
  expect(onCommit).toHaveBeenCalledOnce();
  expect(stepBack.progress()).toBeUndefined();
  // The fingers still down stay held until they lift.
  touch('pointermove', 1, 40, 40);
  expect(moves()).toBe(before);
  touch('pointerup', 1, 40, 40);
  touch('pointerup', 2, 155, 50);
  touch('pointerdown', 1, 0, 0);
  expect(stepBack.pinched()).toBe(false);
});

it('springs back from a short pinch and counts a still one as a tap', () => {
  const onCommit = vi.fn();
  const { stepBack, touch } = mount({ onCommit });
  touch('pointerdown', 1, 0, 0);
  touch('pointerdown', 2, 200, 0);
  touch('pointerdown', 3, 100, 200);
  touch('pointerup', 1, 0, 0);
  expect(onCommit).not.toHaveBeenCalled();
  expect(stepBack.pinched()).toBe(false);
});

it('measures the pinch against the spread it started from', () => {
  expect(
    spread([
      { x: 0, y: 0 },
      { x: 10, y: 0 }
    ])
  ).toBe(5);
  expect(stepBackProgress(100, 100)).toBe(0);
  expect(stepBackProgress(100, 120)).toBe(0);
  expect(stepBackProgress(100, 77.5)).toBeCloseTo(0.5);
  expect(stepBackProgress(100, 10)).toBe(1);
});

function mount(options: Partial<Parameters<typeof createStepBack>[0]> = {}) {
  const target = document.createElement('div');
  const child = document.createElement('canvas');
  target.append(child);
  document.body.append(target);
  let moves = 0;
  child.addEventListener('pointermove', () => moves++);
  const stepBack = createRoot((disposeRoot) => {
    dispose = disposeRoot;
    return createStepBack({ target: () => target, enabled: () => true, onCommit: () => {}, ...options });
  });
  flush();
  const touch = (type: string, pointerId: number, x: number, y: number) => {
    const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'pointerId', { value: pointerId });
    Object.defineProperty(event, 'pointerType', { value: 'touch' });
    child.dispatchEvent(event);
    flush();
  };
  return { moves: () => moves, stepBack, touch };
}
