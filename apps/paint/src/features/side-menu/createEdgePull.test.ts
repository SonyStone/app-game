// @vitest-environment jsdom
import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createEdgePull, pullProgress } from './createEdgePull';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

it('leaves two fingers to the content', () => {
  const { moves, edgePull, touch } = mount();
  touch('pointerdown', 1, 800, 100);
  touch('pointerdown', 2, 900, 100);
  touch('pointermove', 2, 700, 100);
  expect(moves()).toBe(1);
  expect(edgePull.progress()).toBeUndefined();
});

it('takes over a chord near the edge: undoes what the first fingers did, follows the pull and opens on the last lift', () => {
  const restore = vi.fn();
  const onCommit = vi.fn();
  const { moves, edgePull, touch, wait } = mount({ snapshot: () => restore, onCommit });
  touch('pointerdown', 1, 800, 100);
  touch('pointerdown', 2, 900, 200);
  touch('pointermove', 2, 905, 200);
  wait(100);
  touch('pointerdown', 3, 850, 400);
  expect(restore).toHaveBeenCalledOnce();
  expect(edgePull.progress()).toBe(0);

  // Every finger 200 px toward the middle: half of the 400 px pull.
  const before = moves();
  touch('pointermove', 1, 600, 100);
  touch('pointermove', 2, 705, 200);
  touch('pointermove', 3, 650, 400);
  expect(moves()).toBe(before);
  expect(edgePull.progress()).toBeCloseTo(0.5);
  expect(edgePull.pulled()).toBe(true);

  // A fourth finger joining goes on from where the pull was.
  touch('pointerdown', 4, 750, 600);
  expect(edgePull.progress()).toBeCloseTo(0.5);

  // A lift holds the pull, and the fingers still down stay held, until the last one lifts and opens the menu.
  touch('pointerup', 3, 650, 400);
  touch('pointermove', 1, 300, 100);
  expect(moves()).toBe(before);
  expect(edgePull.progress()).toBeCloseTo(0.5);
  touch('pointerup', 1, 300, 100);
  touch('pointerup', 4, 750, 600);
  expect(onCommit).not.toHaveBeenCalled();
  touch('pointerup', 2, 705, 200);
  expect(onCommit).toHaveBeenCalledOnce();
  expect(edgePull.progress()).toBeUndefined();
  touch('pointerdown', 1, 800, 100);
  expect(edgePull.pulled()).toBe(false);
});

it('starts nothing from a finger landing late, away from the edge or after the others moved', () => {
  const late = mount();
  late.touch('pointerdown', 1, 800, 100);
  late.touch('pointerdown', 2, 900, 200);
  late.wait(400);
  late.touch('pointerdown', 3, 850, 400);
  expect(late.edgePull.progress()).toBeUndefined();
  dispose?.();

  const middle = mount();
  middle.touch('pointerdown', 1, 300, 100);
  middle.touch('pointerdown', 2, 400, 200);
  middle.touch('pointerdown', 3, 500, 400);
  expect(middle.edgePull.progress()).toBeUndefined();
  dispose?.();

  // Two fingers turning the drawing, and a third touching down at once.
  const turning = mount();
  turning.touch('pointerdown', 1, 800, 100);
  turning.touch('pointerdown', 2, 900, 300);
  turning.touch('pointermove', 1, 760, 160);
  turning.touch('pointerdown', 3, 850, 400);
  const before = turning.moves();
  turning.touch('pointermove', 1, 600, 160);
  expect(turning.edgePull.progress()).toBeUndefined();
  expect(turning.moves()).toBe(before + 1);
});

it('ends a pull whose last fingers lift after it was disabled, and leaves later touches to the content', () => {
  const [enabled, setEnabled] = createSignal(true);
  const onCommit = vi.fn();
  const { moves, edgePull, touch, wait } = mount({ enabled, onCommit });
  chord(touch);
  pull(touch, 300);
  setEnabled(false);
  flush();
  touch('pointerup', 1, 500, 100);
  touch('pointerup', 2, 600, 200);
  touch('pointerup', 3, 550, 400);
  expect(onCommit).toHaveBeenCalledOnce();

  wait(1000);
  const before = moves();
  chord(touch);
  touch('pointermove', 1, 500, 100);
  expect(moves()).toBe(before + 1);
  expect(edgePull.progress()).toBeUndefined();
});

it('springs back from a short pull, from a cancelled touch, and counts a still chord as a tap', () => {
  const onCommit = vi.fn();
  const { edgePull, touch, wait } = mount({ onCommit });
  chord(touch);
  pull(touch, 100);
  lift(touch);
  expect(onCommit).not.toHaveBeenCalled();
  expect(edgePull.pulled()).toBe(true);

  wait(1000);
  chord(touch);
  pull(touch, 300);
  touch('pointercancel', 1, 500, 100);
  lift(touch);
  expect(onCommit).not.toHaveBeenCalled();

  wait(1000);
  chord(touch);
  lift(touch);
  expect(onCommit).not.toHaveBeenCalled();
  expect(edgePull.pulled()).toBe(false);
});

it('measures the pull against the travel of a full one', () => {
  expect(pullProgress(0, 400)).toBe(0);
  expect(pullProgress(-50, 400)).toBe(0);
  expect(pullProgress(200, 400)).toBe(0.5);
  expect(pullProgress(800, 400)).toBe(1);
  expect(pullProgress(100, 0)).toBe(0);
});

type Touch = ReturnType<typeof mount>['touch'];

/** Three fingers landing together near the right edge. */
function chord(touch: Touch) {
  touch('pointerdown', 1, 800, 100);
  touch('pointerdown', 2, 900, 200);
  touch('pointerdown', 3, 850, 400);
}

/** The chord's fingers moved `by` toward the middle. */
function pull(touch: Touch, by: number) {
  touch('pointermove', 1, 800 - by, 100);
  touch('pointermove', 2, 900 - by, 200);
  touch('pointermove', 3, 850 - by, 400);
}

/** Every finger of the chord lifting. */
function lift(touch: Touch) {
  for (const id of [1, 2, 3]) {
    touch('pointerup', id, 0, 0);
  }
}

function mount(options: Partial<Parameters<typeof createEdgePull>[0]> = {}) {
  const target = document.createElement('div');
  target.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 800);
  const child = document.createElement('canvas');
  target.append(child);
  document.body.append(target);
  let moves = 0;
  child.addEventListener('pointermove', () => moves++);
  const edgePull = createRoot((disposeRoot) => {
    dispose = disposeRoot;
    return createEdgePull({
      target: () => target,
      enabled: () => true,
      onCommit: () => {},
      distance: () => 400,
      ...options
    });
  });
  flush();
  let now = 1000;
  const touch = (type: string, pointerId: number, x: number, y: number) => {
    const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'pointerId', { value: pointerId });
    Object.defineProperty(event, 'pointerType', { value: 'touch' });
    Object.defineProperty(event, 'timeStamp', { value: now });
    child.dispatchEvent(event);
    flush();
  };
  return { moves: () => moves, edgePull, touch, wait: (ms: number) => (now += ms) };
}
