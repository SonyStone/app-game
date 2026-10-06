import { describe, expect, it } from 'vitest';

import {
  appendChild,
  createDefaultElement,
  createDefaultRoot,
  findNode,
  moveNodesTo,
  getAttribute,
  parseSvgMarkup,
  removeNode,
  resetIdCounter,
  svgSize,
  type SvgElementNode
} from '../src/svg-model';

describe('svg-model tree operations', () => {
  it('updates trees immutably when adding and removing nodes', () => {
    resetIdCounter();
    const root = createDefaultRoot();
    const rect = createDefaultElement('rect');
    const withRect = appendChild(root, root.id, rect);

    expect(root.children).toHaveLength(0);
    expect(withRect.children.map((node) => node.id)).toEqual([rect.id]);
    expect(findNode(withRect, rect.id)).toBe(rect);

    const withoutRect = removeNode(withRect, rect.id);

    expect(withoutRect.children).toHaveLength(0);
    expect(withRect.children.map((node) => node.id)).toEqual([rect.id]);
  });

  it('moves only top-level selected nodes and refuses moves into descendants', () => {
    resetIdCounter();
    const root = createDefaultRoot();
    const group = createDefaultElement('g');
    const rect = createDefaultElement('rect');
    const circle = createDefaultElement('circle');
    const groupWithRect = appendChild(group, group.id, rect);
    const tree = appendChild(appendChild(root, root.id, groupWithRect), root.id, circle);

    const moved = moveNodesTo(tree, [groupWithRect.id, rect.id], circle.id, 'after');

    expect(moved.children.map((node) => node.id)).toEqual([circle.id, groupWithRect.id]);

    const invalid = moveNodesTo(tree, [groupWithRect.id], rect.id, 'inside');

    expect(invalid).toBe(tree);
  });
});

describe('svg-model attribute values', () => {
  it('resolves the document size from width, height, and the viewBox aspect ratio', () => {
    expect(svgSize(parseRoot('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"/>'))).toEqual({ width: 24, height: 24, viewBox: [0, 0, 24, 24] });
    expect(svgSize(parseRoot('<svg xmlns="http://www.w3.org/2000/svg" width="210mm" viewBox="0 0 210 297"/>'))).toMatchObject({ width: 210, height: 297 });
    expect(svgSize(parseRoot('<svg xmlns="http://www.w3.org/2000/svg" height="50" viewBox="0 0 200 100"/>'))).toMatchObject({ width: 100, height: 50 });
    expect(svgSize(parseRoot('<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="5 5 40 30"/>'))).toEqual({ width: 40, height: 30, viewBox: [5, 5, 40, 30] });
    expect(svgSize(parseRoot('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"/>'))).toEqual({ width: 64, height: 32, viewBox: [0, 0, 64, 32] });
  });

  it('reads missing attributes as their SVG initial values', () => {
    const root = parseRoot('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/><linearGradient id="g"/></svg>');
    const [circle, gradient] = root.children as SvgElementNode[];

    expect(getAttribute(circle!, 'cx')).toBe('0');
    expect(getAttribute(circle!, 'r')).toBe('10');
    expect(getAttribute(gradient!, 'x2')).toBe('100%');
  });
});

function parseRoot(markup: string): SvgElementNode {
  const parsed = parseSvgMarkup(markup);

  if (!parsed.ok) {
    throw new Error(parsed.message);
  }

  return parsed.root;
}
