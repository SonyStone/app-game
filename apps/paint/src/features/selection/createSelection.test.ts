import { flush } from 'solid-js';
import { expect, it, vi } from 'vitest';
import type { PaintCommand } from '@app-game/paint-core/protocol';
import { createSelection } from './createSelection';
import { guardEdits } from './guardEdits';

it('moves only the outline when dragged inside it, blocks duplicate edits, and restores worker results', () => {
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
  flush();
  const moved = points.map((point) => ({ x: point.x + 30, y: point.y - 20 }));
  expect(send).not.toHaveBeenCalled();
  expect(selection.points()).toEqual(moved);
  selection.action('cut');
  selection.action('cut');
  expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ action: 'cut', points: moved }));
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

it('drops an outline that encloses no area, and ends a lasso when the engine resets the selection', () => {
  const send = vi.fn();
  const selection = createSelection({
    send,
    ready: () => true,
    document: () => ({ activeId: 'layer-1', revision: 1 })
  });
  selection.begin({ x: 0, y: 0 });
  selection.move({ x: 10, y: 10 });
  selection.move({ x: 20, y: 20 });
  flush();
  expect(selection.points()).toHaveLength(3);
  selection.end();
  flush();
  expect(selection.points()).toEqual([]);

  selection.begin({ x: 0, y: 0 });
  selection.move({ x: 10, y: 0 });
  flush();
  expect(selection.drawing()).toBe(true);
  selection.receive({ type: 'selection', points: [], hasClipboard: false });
  expect(() => selection.move({ x: 10, y: 10 })).not.toThrow();
  selection.end();
  flush();
  expect(selection.drawing()).toBe(false);
  expect(selection.points()).toEqual([]);
});

it('keeps the outline through drawing, history and edits, and removes it when a drawing is opened', () => {
  const sent: string[] = [];
  let points = [{ x: 0, y: 0 }];
  const send = guardEdits({ isBusy: () => false, clear: () => (points = []) }, (command: PaintCommand) =>
    sent.push(command.type)
  );
  for (const type of ['undo', 'redo', 'end'] as const) {
    send({ type });
  }

  send({ type: 'edit', edit: 'fill', command: {} });
  expect(points).toHaveLength(1);
  send({ type: 'import', text: '{}' });
  expect(points).toHaveLength(0);
  expect(sent).toEqual(['undo', 'redo', 'end', 'edit', 'import']);
});
