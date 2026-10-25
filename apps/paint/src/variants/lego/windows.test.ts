import { expect, it } from 'vitest';
import { frameAt, panelFrame, pitch, putPanel, removePart, windowHandleHeight, type Board, type Panel } from './board';
import { openChain, visiblePanels } from './windows';

const view = { width: 1400, height: 1000 };
const tile = (id: string) => ({
  id,
  kind: 'action:layers',
  cell: { column: 0, row: 0 },
  span: { columns: 1, rows: 1 }
});
const plate = (id: string, owner?: string): Panel => ({
  id,
  owner,
  at: { x: 0.2, y: 0.2 },
  parts: [tile(`${id}-part`)]
});

it('shows independently opened windows together while folders still use one open chain', () => {
  const root = { ...plate('root'), parts: [tile('a'), tile('b'), tile('folder')] };
  const a = { ...plate('a-window', 'a'), window: { name: 'A', open: true as const } };
  const b = { ...plate('b-window', 'b'), window: { name: 'B', open: true as const } };
  const folder = plate('folder-panel', 'folder');
  const board: Board = { panels: [root, a, b, folder] };
  expect(visiblePanels(board, 'folder', false, view).map(({ panel }) => panel.id)).toEqual([
    'root',
    'a-window',
    'b-window',
    'folder-panel'
  ]);
  expect(visiblePanels(board, undefined, false, view).map(({ panel }) => panel.id)).toEqual([
    'root',
    'a-window',
    'b-window'
  ]);
  expect([...openChain(board, 'folder')]).toEqual(['folder']);
  expect([...openChain(board, 'a')]).toEqual([]);
});

it('follows an owner before the first handle drag and uses independent at afterwards, kept in view', () => {
  const root = plate('root');
  const window = { ...plate('window', 'root-part'), window: { name: 'Layers', open: true as const } };
  const shown = (root: Panel, panel: Panel) =>
    visiblePanels({ panels: [root, panel] }, undefined, false, view).find(({ panel }) => panel.id === 'window')!.frame;
  const moved = { ...root, at: { x: 0.6, y: 0.6 } };
  expect(shown(root, window).rect).not.toEqual(shown(moved, window).rect);
  const placed = { ...window, at: { x: 0.8, y: 0.3 }, window: { ...window.window, placed: true as const } };
  expect(shown(root, placed)).toEqual(shown(moved, placed));
  const small = panelFrame(placed, { width: 100, height: 100 });
  expect(small.rect.left).toBeGreaterThanOrEqual(0);
  expect(small.rect.top).toBeGreaterThanOrEqual(0);
  expect(small.rect.top + small.rect.height).toBeLessThanOrEqual(100);
});

it('adds only a handle strip to the fitted plate and collapse preserves the content origin', () => {
  const panel: Panel = {
    ...plate('window'),
    parts: [{ ...tile('wide'), cell: { column: -2, row: -1 }, span: { columns: 5, rows: 9 } }],
    window: { name: 'Layers' }
  };
  const frame = frameAt(panel, { x: 200, y: 200 });
  const plain = frameAt({ ...panel, window: undefined }, frame.origin);
  expect(frame.rect.width).toBe(plain.rect.width);
  expect(frame.rect.height).toBe(plain.rect.height + windowHandleHeight);
  const collapsed = frameAt({ ...panel, window: { ...panel.window!, collapsed: true } }, frame.origin);
  expect(collapsed.origin).toEqual(frame.origin);
  expect(collapsed.rect.height).toBe(windowHandleHeight);
  expect(collapsed.rect.top).toBe(frame.rect.top);
  expect(collapsed.rect.width).toBe(frame.rect.width);
});

it('retains empty free and owned window plates after their last part moves away', () => {
  const window: Panel = { ...plate('window', 'owner'), window: { name: 'Window' } };
  const board = removePart({ panels: [window] }, 'window-part');
  expect(board.panels).toHaveLength(1);
  expect(putPanel(board, { ...window, parts: [] }).panels).toHaveLength(1);
  expect(frameAt({ ...window, parts: [] }, { x: 0, y: 0 }).rect.width).toBe(3 * pitch - 4 + 12);
});

it('hides a nested folder when its host window collapses or closes', () => {
  const root = plate('root');
  const host: Panel = { ...plate('host', 'root-part'), window: { name: 'Host', open: true } };
  const folder = plate('folder', 'host-part');
  const visible = (host: Panel) =>
    visiblePanels({ panels: [root, host, folder] }, 'host-part', false, view).map(({ panel }) => panel.id);
  expect(visible(host)).toContain('folder');
  expect(visible({ ...host, window: { name: 'Host', open: true, collapsed: true } })).not.toContain('folder');
  expect(visible({ ...host, window: { name: 'Host' } })).not.toContain('folder');
});
