import { expect, it, vi } from 'vitest';
import { createSelection } from './createSelection';

it('moves the original polygon once, blocks duplicate edits, and restores worker results after failure', () => {
  const send = vi.fn();
  const selection = createSelection({
    send,
    ready: () => true,
    document: () => ({ activeId: 'layer-1', revision: 4 })
  });
  const points = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 0, y: 20 }
  ];
  selection.begin(points[0]!);
  points.slice(1).forEach(selection.move);
  selection.end();
  expect(send).not.toHaveBeenCalled();
  selection.begin({ x: 10, y: 10 });
  selection.move({ x: 40.3, y: -10.2 });
  selection.end();
  expect(send).toHaveBeenCalledExactlyOnceWith({
    type: 'selection',
    action: 'move',
    points,
    offset: { x: 30, y: -20 },
    layerId: 'layer-1',
    revision: 4
  });
  selection.action('cut');
  expect(send).toHaveBeenCalledOnce();
  selection.receive({ type: 'selection', points, hasClipboard: false });
  selection.begin({ x: 10, y: 10 });
  selection.move({ x: 200, y: 200 });
  selection.cancel();
  selection.end();
  expect(send).toHaveBeenCalledOnce();
  selection.action('copy');
  expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'copy', points }));
});

it('keeps the clipboard usable after deselecting and switching the active layer', () => {
  const send = vi.fn();
  const selection = createSelection({
    send,
    ready: () => true,
    document: () => ({ activeId: 'layer-2', revision: 8 })
  });
  selection.receive({ type: 'selection', points: [], hasClipboard: true });
  selection.clear();
  selection.action('paste');
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ action: 'paste', layerId: 'layer-2', revision: 8 }));
});
