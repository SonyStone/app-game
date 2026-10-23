import { expect, it } from 'vitest';
import { panelFrame, partsBounds, pitch, placePart, resizePart, spanAfter, type Part } from './board';

const part = (id: string, column: number, row: number, columns = 1, rows = 1): Part => ({
  id,
  kind: 'action:undo',
  cell: { column, row },
  span: { columns, rows }
});
const cells = (parts: Part[]) => Object.fromEntries(parts.map((p) => [p.id, [p.cell.column, p.cell.row]]));

it('pushes a neighbour out of the way of a growing part, and the parts behind it along', () => {
  const parts = [part('a', 0, 0), part('b', 1, 0), part('c', 2, 0)];

  const grown = resizePart(parts, 'a', { columns: 2, rows: 1 });

  expect(cells(grown)).toEqual({ a: [0, 0], b: [2, 0], c: [3, 0] });
});

it('leaves parts that are not in the way where they are', () => {
  const parts = [part('a', 0, 0), part('b', 0, 1), part('far', 5, 5)];

  const grown = resizePart(parts, 'a', { columns: 3, rows: 1 });

  expect(cells(grown)).toEqual({ a: [0, 0], b: [0, 1], far: [5, 5] });
});

it('grows downward over a part below by pushing it down', () => {
  const parts = [part('a', 0, 0), part('b', 0, 1, 3, 1)];

  const grown = resizePart(parts, 'a', { columns: 1, rows: 2 });

  expect(cells(grown)).toEqual({ a: [0, 0], b: [0, 2] });
});

it('pushes a dropped-on part right or down, whichever takes fewer cells', () => {
  // A wide part dropped on: moving a down one row beats moving it right two columns.
  expect(cells(placePart([part('a', 0, 0, 2, 1)], part('new', 0, 0, 2, 1)))).toEqual({ a: [0, 1], new: [0, 0] });
  // A tall part dropped on: right beats down.
  expect(cells(placePart([part('a', 0, 0, 1, 3)], part('new', 0, 0, 1, 3)))).toEqual({ a: [1, 0], new: [0, 0] });
  // Never left or up, even dropped on a part's far half.
  expect(cells(placePart([part('a', 0, 0, 2, 1)], part('new', 1, 0)))).toEqual({ a: [0, 1], new: [1, 0] });
});

it('pushes the parts a pushed part runs into along with it', () => {
  const parts = [part('a', 0, 0), part('b', 1, 0), part('c', 1, 1)];

  expect(cells(placePart(parts, part('new', 0, 0)))).toEqual({ a: [1, 0], b: [2, 0], c: [1, 1], new: [0, 0] });
});

it('sizes a panel to its parts, negative cells included', () => {
  expect(partsBounds([part('a', -1, 0), part('b', 1, 2, 2, 1)])).toEqual({ column: -1, row: 0, columns: 4, rows: 3 });
});

it('shifts a panel that would leave the view back in without changing its cells', () => {
  const frame = panelFrame({ id: 'p', at: { x: 1, y: 0.5 }, parts: [part('a', 0, 0, 2, 1)] }, { width: 800, height: 600 });

  expect(frame.rect.left + frame.rect.width).toBe(800);
  expect(frame.origin.x).toBe(frame.rect.left + 6);
});

it('snaps a corner drag to whole cells', () => {
  expect(spanAfter({ columns: 1, rows: 1 }, { x: pitch * 1.6, y: pitch * 0.4 })).toEqual({ columns: 3, rows: 1 });
  expect(spanAfter({ columns: 2, rows: 2 }, { x: -pitch * 5, y: 0 })).toEqual({ columns: 1, rows: 2 });
});
