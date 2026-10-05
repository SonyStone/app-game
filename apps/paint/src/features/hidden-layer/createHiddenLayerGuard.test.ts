// @vitest-environment jsdom
import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createHiddenLayerGuard, noticeMs } from './createHiddenLayerGuard';

afterEach(() => {
  vi.useRealTimers();
});

it('refuses pen strokes on a hidden layer with a notice that ends when the layer shows or after a while', () => {
  vi.useFakeTimers();
  const [layer, setLayer] = createSignal({ id: 'a', name: 'Sketch', visible: true });
  const [tool, setTool] = createSignal('brush');
  const { guard, dispose } = createRoot((dispose) => ({
    guard: createHiddenLayerGuard({ paints: () => tool() === 'brush', layer }),
    dispose
  }));
  const pen = { altKey: false, pointerType: 'pen' };
  expect(guard.canvasAction.enabled(pen)).toBe(false);

  setLayer({ id: 'a', name: 'Sketch', visible: false });
  flush();
  // Touch navigates, Alt picks colors and other tools are not brushes.
  expect(guard.canvasAction.enabled({ altKey: false, pointerType: 'touch' })).toBe(false);
  expect(guard.canvasAction.enabled({ altKey: true, pointerType: 'mouse' })).toBe(false);
  expect(guard.canvasAction.enabled(pen)).toBe(true);
  expect(guard.notice()).toBeUndefined();
  guard.canvasAction.run();
  flush();
  expect(guard.notice()).toEqual({ id: 'a', name: 'Sketch' });

  // Showing the layer ends the notice at once.
  setLayer({ id: 'a', name: 'Sketch', visible: true });
  flush();
  expect(guard.notice()).toBeUndefined();

  setLayer({ id: 'a', name: 'Sketch', visible: false });
  guard.canvasAction.run();
  flush();
  vi.advanceTimersByTime(noticeMs);
  flush();
  expect(guard.notice()).toBeUndefined();

  setTool('lasso');
  flush();
  expect(guard.canvasAction.enabled(pen)).toBe(false);
  dispose();
});
