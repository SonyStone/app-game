import { describe, expect, it } from 'vitest';

import { clampNumericAttribute } from '../src/editor/tree-utils';
import {
  appendChild,
  createDefaultElement,
  createDefaultRoot,
  findNode,
  moveNodesTo,
  getAttribute,
  moveNodesInParent,
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

describe('svg-model moving siblings', () => {
  const root = parseRoot(
    '<svg xmlns="http://www.w3.org/2000/svg"><g id="a"/><g id="b"><rect id="b1"/></g><g id="c"/><g id="d"/></svg>'
  );
  const id = (name: string) => {
    const node = [...root.children, ...(root.children[1] as SvgElementNode).children].find(
      (child) => child.kind === 'element' && getAttribute(child, 'id', true) === name
    );
    return node!.id;
  };
  const order = (next: SvgElementNode) => next.children.map((child) => (child.kind === 'element' ? getAttribute(child, 'id', true) : ''));

  it('moves adjacent nodes as a block', () => {
    expect(order(moveNodesInParent(root, [id('a'), id('b')], 1))).toEqual(['c', 'a', 'b', 'd']);
    expect(order(moveNodesInParent(root, [id('c'), id('d')], -1))).toEqual(['a', 'c', 'd', 'b']);
    expect(order(moveNodesInParent(root, [id('a'), id('c')], 1))).toEqual(['b', 'a', 'd', 'c']);
  });

  it('ignores selected descendants and refuses nodes from different parents', () => {
    expect(order(moveNodesInParent(root, [id('b'), id('b1')], -1))).toEqual(['b', 'a', 'c', 'd']);
    expect(moveNodesInParent(root, [id('a'), id('b1')], 1)).toBe(root);
    expect(moveNodesInParent(root, [id('d')], 1)).toBe(root);
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

describe('numeric attribute clamping', () => {
  it('clamps ranges but keeps units and in-range text', () => {
    expect(clampNumericAttribute('width', '10mm')).toBe('10mm');
    expect(clampNumericAttribute('width', '-5mm')).toBe('0mm');
    expect(clampNumericAttribute('opacity', '7')).toBe('1');
    expect(clampNumericAttribute('opacity', '0.50')).toBe('0.50');
    expect(clampNumericAttribute('opacity', '50%')).toBe('50%');
    expect(clampNumericAttribute('x', 'abc')).toBe('abc');
  });
});

