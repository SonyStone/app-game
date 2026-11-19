import { expect, it } from 'vitest';
import { placePart, type Part } from './board';
import { joinsAttribute, panelEdges, partEdges, partJoins } from './fusion';
import { partDefinitions, partGroup } from './parts';
import { penPressureKind } from './parts/pressureCurve';
import { brushValueParts } from './parts/values';

const part = (id: string, kind: string, column: number, row: number, columns = 1, rows = 1): Part => ({
  id,
  kind,
  cell: { column, row },
  span: { columns, rows }
});

/** The joins of `parts` as each part's `data-joins`, by id; parts without joins are absent. */
const joined = (parts: readonly Part[]) =>
  Object.fromEntries([...partJoins(parts, partGroup)].map(([id, joins]) => [id, joinsAttribute(joins)]));

it('fuses neighbours of one group along their shared edge', () => {
  const parts = [
    part('lasso', 'action:lasso', 0, 0),
    part('fill', 'action:fill', 1, 0),
    part('transform', 'action:transform', 2, 0)
  ];

  expect(joined(parts)).toEqual({ lasso: 'right', fill: 'right left', transform: 'left' });
});

it('keeps the gap between neighbours of different groups', () => {
  const parts = [
    part('undo', 'action:undo', 0, 0),
    part('redo', 'action:redo', 1, 0),
    part('size', 'value:size', 2, 0)
  ];

  expect(joined(parts)).toEqual({ undo: 'right', redo: 'left' });
});

it('fuses only parts on the same plate', () => {
  const left = [part('hue', 'value:hue', 0, 0, 5, 1)];
  const right = [part('brightness', 'value:brightness', 0, 1, 5, 1)];

  expect(joined(left)).toEqual({});
  expect(joined(right)).toEqual({});
  expect(joined([...left, ...right])).toEqual({ hue: 'bottom', brightness: 'top' });
});

it('does not fuse parts that only touch at a corner or lie a cell apart', () => {
  const parts = [
    part('lasso', 'action:lasso', 0, 0),
    part('fill', 'action:fill', 1, 1),
    part('transform', 'action:transform', 3, 0)
  ];

  expect(joined(parts)).toEqual({});
});

it('fuses parts of different sizes when one side lies wholly against the other', () => {
  const parts = [
    part('eraser', 'action:eraser', 0, 0, 3, 1),
    part('lasso', 'action:lasso', 0, 1),
    part('fill', 'action:fill', 1, 1),
    part('transform', 'action:transform', 2, 1)
  ];

  expect(joined(parts)).toEqual({
    eraser: 'bottom',
    lasso: 'top right',
    fill: 'top right left',
    transform: 'top left'
  });
});

it('keeps the gap along a side that lies only partly against its group', () => {
  // The eraser's bottom lies against the lasso and the fill, but its last cell against the size knob.
  const partly = [
    part('eraser', 'action:eraser', 0, 0, 3, 1),
    part('lasso', 'action:lasso', 0, 1),
    part('fill', 'action:fill', 1, 1),
    part('size', 'value:size', 2, 1)
  ];
  // Two two-cell parts, one shifted by a cell: neither side is covered.
  const shifted = [part('hue', 'value:hue', 0, 0, 2, 1), part('brightness', 'value:brightness', 1, 1, 2, 1)];
  // The bottom part reaches past the top one, whose bottom is covered but whose neighbour's top is not.
  const overhang = [part('add', 'layer:add', 0, 0), part('duplicate', 'layer:duplicate', 0, 1, 2, 1)];

  expect(joined(partly)).toEqual({ lasso: 'right', fill: 'left' });
  expect(joined(shifted)).toEqual({});
  expect(joined(overhang)).toEqual({});
});

it('fuses again after a move brings a part beside its group, and parts once apart stop fusing', () => {
  const before = [
    part('undo', 'action:undo', 0, 0),
    part('redo', 'action:redo', 2, 0),
    part('size', 'value:size', 1, 0)
  ];
  expect(joined(before)).toEqual({});

  const moved = placePart(before, { ...before[1]!, cell: { column: 1, row: 0 } });
  expect(joined(moved)).toEqual({ undo: 'right', redo: 'left' });

  const apart = placePart(moved, { ...moved[0]!, cell: { column: 0, row: 3 } });
  expect(joined(apart)).toEqual({});
});

it('never fuses a kind without a group', () => {
  const parts = [part('a', 'unknown:kind', 0, 0), part('b', 'unknown:kind', 1, 0)];

  expect(joined(parts)).toEqual({});
});

it('gives every registered kind a group', () => {
  const kinds = [
    ...partDefinitions.map((definition) => definition.kind),
    ...brushValueParts.map((definition) => definition.kind),
    penPressureKind,
    'preset:builtin:soft-round',
    'value:brush:stabilization'
  ];

  for (const kind of kinds) {
    expect(partGroup(kind), kind).toEqual(expect.any(String));
  }
});

it('squares a plate pushed against the screen, and the parts along that side of it, as the edge runs straight on', () => {
  const view = { width: 1000, height: 800 };
  expect(joinsAttribute(panelEdges({ left: 900, top: 300, width: 100, height: 200 }, view))).toBe('right');
  expect(joinsAttribute(panelEdges({ left: 0, top: 0, width: 100, height: 200 }, view))).toBe('top left');
  expect(joinsAttribute(panelEdges({ left: 20, top: 300, width: 100, height: 200 }, view))).toBeUndefined();

  // Size and Opacity side by side against the right edge: only Opacity lies along it, over both of its corners.
  const parts = [part('size', 'value:size', 0, 0, 1, 4), part('opacity', 'value:opacity', 1, 0, 1, 4)];
  const right = panelEdges({ left: 900, top: 0, width: 100, height: 200 }, view);
  expect(parts.map((each) => joinsAttribute(partEdges(each, parts, right)))).toEqual(['top', 'top right']);
  // A floating plate's grip lies above its parts, so they keep their top corners.
  expect(parts.map((each) => joinsAttribute(partEdges(each, parts, right, true)))).toEqual([undefined, 'right']);
});
