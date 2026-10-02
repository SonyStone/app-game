// @vitest-environment jsdom
import { createRoot } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createPaintShortcuts } from './createPaintShortcuts';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
});

function mount(panelOpen: () => boolean) {
  const actions = {
    closePanel: vi.fn(panelOpen),
    tool: () => 'lasso' as const,
    chooseTool: vi.fn(),
    selectionAction: vi.fn(),
    deselect: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    save: vi.fn(),
    swapColors: vi.fn(),
    resetColors: vi.fn(),
    scaleBrush: vi.fn(),
    cancel: vi.fn()
  };
  createRoot((disposeRoot) => {
    dispose = disposeRoot;
    createPaintShortcuts(actions);
  });
  return actions;
}

const press = (key: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));

it('closes an open panel with Escape without cancelling the lasso outline', () => {
  let open = true;
  const actions = mount(() => {
    const wasOpen = open;
    open = false;
    return wasOpen;
  });

  press('Escape');
  expect(actions.closePanel).toHaveBeenCalledTimes(1);
  expect(actions.cancel).not.toHaveBeenCalled();

  press('Escape');
  expect(actions.cancel).toHaveBeenCalledTimes(1);
});

it('ignores single-key tool and size shortcuts held with modifiers', () => {
  const actions = mount(() => false);

  press('b', { altKey: true });
  press('l', { ctrlKey: true });
  press('[', { metaKey: true });
  press(']', { altKey: true });
  expect(actions.chooseTool).not.toHaveBeenCalled();
  expect(actions.scaleBrush).not.toHaveBeenCalled();

  press('b');
  press(']');
  expect(actions.chooseTool).toHaveBeenCalledWith('brush');
  expect(actions.scaleBrush).toHaveBeenCalledWith(1.25);
});
