import { describe, expect, it } from 'vitest';

import { collectContours } from '../src/editor/contours';
import { createShapeAt, newShapeUnit } from '../src/editor/new-shape';
import { parsePathData, pathSegmentOutlines } from '../src/path-data';
import { getAttribute, parseSvgMarkup, type SvgElementNode } from '../src/svg-model';

describe('pathSegmentOutlines', () => {
  it('draws each command on its own in absolute coordinates, with tangents for curves', () => {
    const outlines = pathSegmentOutlines(parsePathData('M10 10 c10 -20 30 -20 40 0 s10 20 20 0 l0 10 z'));

    expect(outlines.map((outline) => [outline.index, outline.d])).toEqual([
      [1, 'M 10 10 C 20 -10 40 -10 50 10'],
      [2, 'M 50 10 C 60 30 60 30 70 10'],
      [3, 'M 70 10 L 70 20'],
      [4, 'M 70 20 L 10 10']
    ]);
    expect(outlines[0]?.tangents).toEqual([
      [{ x: 10, y: 10 }, { x: 20, y: -10 }],
      [{ x: 40, y: -10 }, { x: 50, y: 10 }]
    ]);
  });
});

describe('collectContours', () => {
  const root = parse(
    '<svg xmlns="http://www.w3.org/2000/svg"><rect id="r" width="10" height="5"/><g transform="translate(5 0)"><circle id="c" r="2"/><path id="p" d="M0 0 L5 0 L5 5"/></g></svg>'
  );
  const [rect, group] = root.children as SvgElementNode[];
  const [circle, path] = (group?.children ?? []) as SvgElementNode[];

  it('outlines only hovered and selected elements, with their state and accumulated transform', () => {
    const contours = collectContours(root, { selectedIds: [group!.id], hovered: { nodeId: rect!.id }, selectedCommand: undefined });

    expect(contours.map((contour) => [contour.key, contour.state])).toEqual([
      [rect!.id, 'hovered'],
      [circle!.id, 'selected'],
      [`${circle!.id}:radius`, 'selected'],
      [`${path!.id}:1`, 'selected'],
      [`${path!.id}:2`, 'selected']
    ]);
    expect(contours.find((contour) => contour.key === circle!.id)?.transform).toBe('matrix(1 0 0 1 5 0)');
    expect(contours[0]).toMatchObject({ kind: 'shape', attrs: { width: '10', height: '5' } });
  });

  it('highlights a hovered or selected path command', () => {
    const contours = collectContours(root, {
      selectedIds: [path!.id],
      hovered: { nodeId: path!.id, commandIndex: 2 },
      selectedCommand: { nodeId: path!.id, indices: [1], pivot: 1 }
    });

    expect(contours.map((contour) => contour.state)).toEqual(['selected', 'hovered-selected']);
  });
});

describe('new shapes', () => {
  it('uses GodSVG setups at the point, scaled to the document', () => {
    expect(newShapeUnit([0, 0, 900, 900])).toBe(100);
    expect(newShapeUnit([0, 0, 24, 24])).toBe(5);
    expect(createShapeAt('circle', { x: 10, y: 20 }, 5).attrs).toEqual([
      { name: 'cx', value: '10' },
      { name: 'cy', value: '20' },
      { name: 'r', value: '5' }
    ]);
    expect(getAttribute(createShapeAt('line', { x: 1, y: 2 }, 5), 'x2')).toBe('6');
    expect(getAttribute(createShapeAt('path', { x: 1.5, y: 2 }, 5), 'd')).toBe('M 1.5 2');
  });
});

function parse(markup: string): SvgElementNode {
  const parsed = parseSvgMarkup(markup);

  if (!parsed.ok) {
    throw new Error(parsed.message);
  }

  return parsed.root;
}
