import { describe, expect, it } from 'vitest';

import { svgCapabilities } from '../src/editor/capabilities';
import {
  applyEditorOperation,
  applyEditorOperations,
  invertEditorOperation,
  mergeEditorOperation,
  toSvgNodeId,
  type EditorOperation
} from '../src/editor/operations';
import {
  appendChild,
  createDefaultElement,
  createDefaultRoot,
  createElementNode,
  findNode,
  getAttribute,
  resetIdCounter,
  type SvgElementNode
} from '../src/svg-model';

describe('editor operations', () => {
  it('applies and inverts attribute operations', () => {
    resetIdCounter();
    const root = createDefaultRoot();
    const rect = svgCapabilities.createElement('rect');
    const tree = appendChild(root, root.id, rect);
    const operation = {
      kind: 'svg.set-attribute',
      nodeId: rect.id,
      name: 'fill',
      value: 'red'
    } satisfies EditorOperation;

    const changed = applyEditorOperation(tree, operation);
    const changedRect = requireElement(changed, rect.id);

    expect(getAttribute(changedRect, 'fill', true)).toBe('red');

    const inverse = invertEditorOperation(tree, operation);

    expect(inverse).toEqual([
      { kind: 'svg.set-attribute', nodeId: rect.id, name: 'fill', value: 'white' }
    ]);
    expect(applyEditorOperations(changed, inverse ?? [])).toEqual(tree);
  });

  it('applies insert and remove operations with inverse operations', () => {
    resetIdCounter();
    const root = createDefaultRoot();
    const circle = createDefaultElement('circle');
    const insert = {
      kind: 'svg.insert-node',
      parentId: root.id,
      index: 0,
      node: circle
    } satisfies EditorOperation;

    const inserted = applyEditorOperation(root, insert);

    expect(inserted.children.map((node) => node.id)).toEqual([circle.id]);

    const undoInsert = invertEditorOperation(root, insert);
    expect(applyEditorOperations(inserted, undoInsert ?? [])).toEqual(root);

    const remove = { kind: 'svg.remove-node', nodeId: circle.id } satisfies EditorOperation;
    const removed = applyEditorOperation(inserted, remove);
    const undoRemove = invertEditorOperation(inserted, remove);

    expect(removed.children).toHaveLength(0);
    expect(applyEditorOperations(removed, undoRemove ?? [])).toEqual(inserted);
  });

  it('applies and inverts root replacement operations', () => {
    resetIdCounter();
    const root = createDefaultRoot();
    const rect = createDefaultElement('rect');
    const replacement = createElementNode('svg', [{ name: 'viewBox', value: '0 0 20 20' }], [rect]);
    const operation = {
      kind: 'svg.replace-root',
      root: replacement
    } satisfies EditorOperation;

    const changed = applyEditorOperation(root, operation);

    expect(changed).toEqual(replacement);
    expect(changed).not.toBe(replacement);

    const inverse = invertEditorOperation(root, operation);

    expect(applyEditorOperations(changed, inverse ?? [])).toEqual(root);
  });

  it('applies node move operations', () => {
    resetIdCounter();
    const root = createDefaultRoot();
    const rect = createDefaultElement('rect');
    const circle = createDefaultElement('circle');
    const tree = appendChild(appendChild(root, root.id, rect), root.id, circle);

    const movedWithinParent = applyEditorOperation(tree, {
      kind: 'svg.move-node-in-parent',
      nodeId: rect.id,
      direction: 1
    });

    expect(movedWithinParent.children.map((node) => node.id)).toEqual([circle.id, rect.id]);

    const movedToTarget = applyEditorOperation(tree, {
      kind: 'svg.move-nodes',
      nodeIds: [rect.id],
      targetId: circle.id,
      position: 'after'
    });

    expect(movedToTarget.children.map((node) => node.id)).toEqual([circle.id, rect.id]);
  });

  it('inverts multi-parent node move operations with restore locations', () => {
    resetIdCounter();
    const root = createDefaultRoot();
    const groupA = createDefaultElement('g');
    const groupB = createDefaultElement('g');
    const groupC = createDefaultElement('g');
    const rect = createDefaultElement('rect');
    const path = createDefaultElement('path');
    const circle = createDefaultElement('circle');
    let tree = appendChild(root, root.id, groupA);
    tree = appendChild(tree, root.id, groupB);
    tree = appendChild(tree, root.id, groupC);
    tree = appendChild(tree, groupA.id, rect);
    tree = appendChild(tree, groupA.id, path);
    tree = appendChild(tree, groupB.id, circle);
    const operation = {
      kind: 'svg.move-nodes',
      nodeIds: [rect.id, circle.id],
      targetId: groupC.id,
      position: 'inside'
    } satisfies EditorOperation;

    const moved = applyEditorOperation(tree, operation);

    expect(requireElement(moved, groupA.id).children.map((node) => node.id)).toEqual([path.id]);
    expect(requireElement(moved, groupB.id).children).toHaveLength(0);
    expect(requireElement(moved, groupC.id).children.map((node) => node.id)).toEqual([rect.id, circle.id]);

    const inverse = invertEditorOperation(tree, operation);

    expect(inverse).toEqual([
      {
        kind: 'svg.restore-node-locations',
        locations: [
          { nodeId: rect.id, parentId: groupA.id, index: 0 },
          { nodeId: circle.id, parentId: groupB.id, index: 0 }
        ]
      }
    ]);
    expect(applyEditorOperations(moved, inverse ?? [])).toEqual(tree);

    const restoreOperation = inverse?.[0];

    if (!restoreOperation) {
      throw new Error('Expected restore operation');
    }

    const redo = invertEditorOperation(moved, restoreOperation);

    expect(applyEditorOperations(tree, redo ?? [])).toEqual(moved);
  });

  it('merges repeated scalar operations for the same target', () => {
    const first = {
      kind: 'svg.set-attribute',
      nodeId: toSvgNodeId('x2'),
      name: 'fill',
      value: 'red'
    } satisfies EditorOperation;
    const second = {
      kind: 'svg.set-attribute',
      nodeId: toSvgNodeId('x2'),
      name: 'fill',
      value: 'blue'
    } satisfies EditorOperation;

    expect(mergeEditorOperation(first, second)).toBe(second);
  });
});

function requireElement(root: SvgElementNode, id: string): SvgElementNode {
  const node = findNode(root, id);

  if (!node || node.kind !== 'element') {
    throw new Error(`Expected element ${id}`);
  }

  return node;
}
