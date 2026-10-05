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
    selectAll: vi.fn(),
    invertSelection: vi.fn(),
    chooseWand: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    save: vi.fn(),
    swapColors: vi.fn(),
    resetColors: vi.fn(),
    scaleBrush: vi.fn(),
    zoomBy: vi.fn(),
    resetZoom: vi.fn(),
    transform: vi.fn(),
    confirm: vi.fn(() => true),
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

it('starts or applies a transform with Ctrl/Cmd+T and confirms with Enter', () => {
  const actions = mount(() => false);
  const transform = press('t', { metaKey: true });
  press('t', { ctrlKey: true });
  expect(transform).toBe(false);
  expect(actions.transform).toHaveBeenCalledTimes(2);
  press('Enter');
  expect(actions.confirm).toHaveBeenCalledOnce();

  const button = document.body.appendChild(document.createElement('button'));
  button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  expect(actions.confirm).toHaveBeenCalledOnce();
  button.remove();
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

it('matches letters and brackets by physical key on non-Latin layouts, and by the typed letter on Latin ones', () => {
  const actions = mount(() => false);

  press('и', { code: 'KeyB' });
  press('х', { code: 'BracketLeft' });
  press('я', { code: 'KeyZ', ctrlKey: true });
  expect(actions.chooseTool).toHaveBeenCalledWith('brush');
  expect(actions.scaleBrush).toHaveBeenCalledWith(0.8);
  expect(actions.undo).toHaveBeenCalledOnce();

  // Dvorak types `e` on the physical D key.
  press('e', { code: 'KeyD' });
  expect(actions.chooseTool).toHaveBeenLastCalledWith('eraser');
  expect(actions.resetColors).not.toHaveBeenCalled();
});

it('zooms the canvas instead of the page and redoes with Ctrl+Y', () => {
  const actions = mount(() => false);
  const zoomIn = new KeyboardEvent('keydown', { key: '=', ctrlKey: true, cancelable: true });
  window.dispatchEvent(zoomIn);
  press('-', { metaKey: true });
  press('0', { ctrlKey: true });
  press('y', { ctrlKey: true });
  expect(zoomIn.defaultPrevented).toBe(true);
  expect(actions.zoomBy.mock.calls).toEqual([[1.25], [0.8]]);
  expect(actions.resetZoom).toHaveBeenCalledOnce();
  expect(actions.redo).toHaveBeenCalledOnce();

  press('0');
  expect(actions.resetZoom).toHaveBeenCalledOnce();
});

it('selects all, inverts the selection and chooses the magic wand', () => {
  const actions = mount(() => false);
  press('a', { ctrlKey: true });
  press('I', { metaKey: true, shiftKey: true });
  press('w');
  press('a');
  expect(actions.selectAll).toHaveBeenCalledOnce();
  expect(actions.invertSelection).toHaveBeenCalledOnce();
  expect(actions.chooseWand).toHaveBeenCalledOnce();
});
