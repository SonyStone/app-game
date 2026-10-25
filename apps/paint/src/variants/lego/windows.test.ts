import { expect, it } from 'vitest';
import {
  cellSize,
  frameAt,
  panelFrame,
  panelPadding,
  pitch,
  putPanel,
  removePart,
  windowHandleHeight,
  windowTileColumns,
  type Board,
  type Panel
} from './board';
import { canDropParts, openChain, visiblePanels } from './windows';

const view = { width: 1400, height: 1000 };
const tile = (id: string) => ({
  id,
  kind: 'color:swatch',
  cell: { column: 0, row: 0 },
  span: { columns: 1, rows: 1 }
});
const plate = (id: string, owner?: string): Panel => ({
  id,
  owner,
  at: { x: 0.2, y: 0.2 },
  parts: [tile(`${id}-part`)]
});

it('shows all free windows in every mode while folders still use one open chain', () => {
  const root = { ...plate('root'), parts: [tile('folder')] };
  const a = { ...plate('a-window'), window: { name: 'A' } };
  const b: Panel = { ...plate('b-window'), window: { name: 'B', collapsed: true } };
  const folder = plate('folder-panel', 'folder');
  const board: Board = { panels: [root, a, b, folder] };
  for (const editing of [false, true]) {
    expect(visiblePanels(board, 'folder', editing, view).map(({ panel }) => panel.id)).toEqual([
      'root',
      'a-window',
      'b-window',
      'folder-panel'
    ]);
    expect(visiblePanels(board, undefined, editing, view).map(({ panel }) => panel.id)).toEqual([
      'root',
      'a-window',
      'b-window'
    ]);
  }
  expect([...openChain(board, 'folder')]).toEqual(['folder']);
});

it('uses the same top-left for a tile and expanded plate, including negative content cells', () => {
  const panel: Panel = {
    ...plate('window'),
    parts: [{ ...tile('wide'), cell: { column: -2, row: -1 }, span: { columns: 5, rows: 9 } }],
    window: { name: 'Layers' }
  };
  const expanded = panelFrame(panel, view);
  const collapsed = panelFrame({ ...panel, window: { ...panel.window!, collapsed: true } }, view);
  expect(expanded.rect.left).toBe(panel.at.x * view.width);
  expect(expanded.rect.top).toBe(panel.at.y * view.height);
  expect(collapsed.rect.left).toBe(expanded.rect.left);
  expect(collapsed.rect.top).toBe(expanded.rect.top);
  expect(collapsed.rect.height).toBe(cellSize + panelPadding * 2);
  expect(collapsed.rect.width).toBe(2 * pitch - 4 + panelPadding * 2);
  const plain = frameAt({ ...panel, window: undefined }, expanded.origin);
  expect(expanded.rect.height).toBe(plain.rect.height + windowHandleHeight);
});

it('shifts expanded windows into view without changing stored placement', () => {
  const panel: Panel = { ...plate('window'), at: { x: 0.99, y: 0.99 }, window: { name: 'Layers' } };
  const before = { ...panel.at };
  const frame = panelFrame(panel, view);
  expect(frame.rect.left + frame.rect.width).toBe(view.width);
  expect(frame.rect.top + frame.rect.height).toBe(view.height);
  expect(panel.at).toEqual(before);
  expect(windowTileColumns('A')).toBe(2);
  expect(windowTileColumns('A very long window name')).toBe(4);
});

it('retains an empty free window after its last part moves away', () => {
  const window: Panel = { ...plate('window'), window: { name: 'Window' } };
  const board = removePart({ panels: [window] }, 'window-part');
  expect(board.panels).toHaveLength(1);
  expect(putPanel(board, { ...window, parts: [] }).panels).toHaveLength(1);
  expect(frameAt({ ...window, parts: [] }, { x: 0, y: 0 }).rect.width).toBe(3 * pitch - 4 + 12);
});

it('hides a nested folder when its host window collapses', () => {
  const host: Panel = { ...plate('host'), window: { name: 'Host' } };
  const folder = plate('folder', 'host-part');
  const visible = (host: Panel) =>
    visiblePanels({ panels: [host, folder] }, 'host-part', false, view).map(({ panel }) => panel.id);
  expect(visible(host)).toContain('folder');
  expect(visible({ ...host, window: { name: 'Host', collapsed: true } })).not.toContain('folder');
});

it('rejects folder descendants and malformed folder cycles as drop targets', () => {
  const root = { ...plate('root'), parts: [tile('a'), tile('b')] };
  const a = { ...plate('a-folder', 'a'), parts: [tile('nested')] };
  const nested = plate('nested-folder', 'nested');
  const board = { panels: [root, a, nested] };
  expect(canDropParts(board, a, new Set(['a']))).toBe(false);
  expect(canDropParts(board, nested, new Set(['unrelated', 'a']))).toBe(false);
  expect(canDropParts(board, a, new Set(['b']))).toBe(true);
  const b = { ...plate('b-folder', 'b'), parts: [tile('a')] };
  expect(canDropParts({ panels: [a, b] }, a, new Set(['b']))).toBe(false);
  expect(canDropParts(board, root, new Set(['a']))).toBe(true);
});
