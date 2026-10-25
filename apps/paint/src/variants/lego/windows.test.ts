import { expect, it } from 'vitest';
import { floatingGripHeight, frameAt, panelFrame, pitch, putPanel, removePart, type Board, type Panel } from './board';
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

it('shows all floating panels in every mode while folders still use one open chain', () => {
  const root = { ...plate('root'), parts: [tile('folder')] };
  const a = { ...plate('a-window'), floating: true as const };
  const b: Panel = { ...plate('b-window'), floating: true as const };
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

it('uses stored top-left and adds only the thin grip above fitted parts, including negative cells', () => {
  const panel: Panel = {
    ...plate('floating'),
    parts: [{ ...tile('wide'), cell: { column: -2, row: -1 }, span: { columns: 5, rows: 9 } }],
    floating: true
  };
  const fitted = panelFrame(panel, view);
  expect(fitted.rect.left).toBe(panel.at.x * view.width);
  expect(fitted.rect.top).toBe(panel.at.y * view.height);
  const plain = frameAt({ ...panel, floating: undefined }, fitted.origin);
  expect(fitted.rect.height).toBe(plain.rect.height + floatingGripHeight);
  expect(fitted.rect.width).toBe(plain.rect.width);
  expect(floatingGripHeight + 6).toBe(14);
});

it('shifts floating panels into view without changing stored placement', () => {
  const panel: Panel = { ...plate('window'), at: { x: 0.99, y: 0.99 }, floating: true as const };
  const before = { ...panel.at };
  const frame = panelFrame(panel, view);
  expect(frame.rect.left + frame.rect.width).toBe(view.width);
  expect(frame.rect.top + frame.rect.height).toBe(view.height);
  expect(panel.at).toEqual(before);
});

it('retains an empty floating panel after its last part moves away', () => {
  const window: Panel = { ...plate('window'), floating: true as const };
  const board = removePart({ panels: [window] }, 'window-part');
  expect(board.panels).toHaveLength(1);
  expect(putPanel(board, { ...window, parts: [] }).panels).toHaveLength(1);
  expect(frameAt({ ...window, parts: [] }, { x: 0, y: 0 }).rect.width).toBe(3 * pitch - 4 + 12);
});

it('keeps nested folders visible on floating panels in both modes', () => {
  const host: Panel = { ...plate('host'), floating: true };
  const folder = plate('folder', 'host-part');
  for (const editing of [false, true]) {
    expect(
      visiblePanels({ panels: [host, folder] }, 'host-part', editing, view).map(({ panel }) => panel.id)
    ).toContain('folder');
  }
});

it('shows only the strip of an empty floating plate in Live and keeps it at the viewport edge', () => {
  const panel: Panel = { ...plate('empty'), floating: true, parts: [], at: { x: 0.99, y: 0.99 } };
  const live = visiblePanels({ panels: [panel] }, undefined, false, view)[0]!.frame.rect;
  const edit = visiblePanels({ panels: [panel] }, undefined, true, view)[0]!.frame.rect;
  expect(live.height).toBe(14);
  expect(edit.height).toBe(64);
  expect(live.top + live.height).toBe(view.height);
  expect(live.width).toBe(edit.width);
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
