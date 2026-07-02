import { describe, expect, it } from 'vitest';

import {
  appendChild,
  createDefaultElement,
  createDefaultRoot,
  findNode,
  moveNodesTo,
  removeNode,
  resetIdCounter
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
