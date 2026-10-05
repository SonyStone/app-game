// @vitest-environment jsdom
import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createLayerFilter } from './createLayerFilter';

afterEach(() => {
  vi.useRealTimers();
});

it('lists layers in view, the selected one and empty ones, following the view only once it rests', () => {
  vi.useFakeTimers();
  const { filter, setInView, setCamera, setActive, dispose } = setup();
  const shown = () => ['a', 'b', 'c', 'empty'].filter(filter.shown);
  expect(shown()).toEqual(['a', 'empty']);
  expect(filter.offScreen()).toBe(2);

  // While the view moves the list stays; it follows 300 ms after the last move.
  setInView(['b']);
  setCamera(1);
  flush();
  vi.advanceTimersByTime(200);
  setCamera(2);
  flush();
  vi.advanceTimersByTime(200);
  expect(shown()).toEqual(['a', 'empty']);
  vi.advanceTimersByTime(100);
  flush();
  // `a` stays listed while it is selected.
  expect(shown()).toEqual(['a', 'b', 'empty']);

  setActive('c');
  flush();
  expect(shown()).toEqual(['b', 'c', 'empty']);
  filter.setShowAll(true);
  flush();
  expect(shown()).toEqual(['a', 'b', 'c', 'empty']);
  expect(filter.offScreen()).toBe(1);
  dispose();
});

function setup() {
  return createRoot((dispose) => {
    const [inView, setInView] = createSignal<readonly string[]>(['a']);
    const [camera, setCamera] = createSignal(0);
    const [active, setActive] = createSignal('a');
    const layers = [
      { id: 'a', tileCount: 3 },
      { id: 'b', tileCount: 1 },
      { id: 'c', tileCount: 5 },
      { id: 'empty', tileCount: 0 }
    ];
    const filter = createLayerFilter({ layers: () => layers, activeId: active, inView, camera });
    return { filter, setInView, setCamera, setActive, dispose };
  });
}
