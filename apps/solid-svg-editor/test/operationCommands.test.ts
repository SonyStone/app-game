import { describe, expect, it } from 'vitest';

import {
  createSetAttributeCommand,
  createSetAttributesCommand
} from '../src/editor/commands/attributeCommands';
import { createOptimizeSvgCommand } from '../src/editor/commands/documentCommands';
import {
  createAddElementCommand,
  createAddTextNodeCommand,
  createDuplicateNodesCommand,
  createInsertNodeAfterCommand
} from '../src/editor/commands/nodeCommands';
import { defaultSettings } from '../src/editor/defaults';
import {
  createConvertPathCommandCommand,
  createDeletePathCommandIntent,
  createDeletePathCommandCommand,
  createInsertPathCommandFromKeyIntent,
  createInsertPathCommandIntent,
  createInsertPathCommandCommand,
  createTogglePathCommandRelativeCommand,
  createUpdatePathAnchorCommand
} from '../src/editor/commands/pathCommands';
import { pathCommandSelectionTarget } from '../src/editor/selection-targets';
import {
  createAddPointCommand,
  createDeletePointCommand,
  createUpdatePointCommand
} from '../src/editor/commands/pointCommands';
import { createTransformSelectedCommand } from '../src/editor/commands/transformCommands';
import { translateMatrix } from '../src/editor/geometry';
import { isOperationBackedEditorCommand } from '../src/editor/operations';
import {
  appendChild,
  createId,
  createDefaultElement,
  createDefaultRoot,
  createElementNode,
  findNode,
  getAttribute,
  resetIdCounter,
  type SvgElementNode,
  type SvgNode
} from '../src/svg-model';

describe('operation-backed command factories', () => {
  it('creates commands that expose serializable operations and apply them', () => {
    resetIdCounter();
    const root = createDefaultRoot();
    const rect = createDefaultElement('rect');
    const tree = appendChild(root, root.id, rect);
    const command = createSetAttributeCommand(rect.id, 'stroke', 'red');

    expect(isOperationBackedEditorCommand(command)).toBe(true);
    expect(command.durability).toEqual({ kind: 'operation' });
    expect(command.resolveOperations(tree)).toEqual([
      { kind: 'svg.set-attribute', nodeId: rect.id, name: 'stroke', value: 'red' }
    ]);

    const changed = command.apply(tree);
    expect(getAttribute(requireElement(changed, rect.id), 'stroke', true)).toBe('red');
  });

  it('sets multiple attributes through one operation-backed command', () => {
    resetIdCounter();
    const root = createDefaultRoot();
    const rect = createDefaultElement('rect');
    const tree = appendChild(root, root.id, rect);
    const command = createSetAttributesCommand(
      rect.id,
      [
        { name: 'x', value: '12' },
        { name: 'y', value: '24' }
      ],
      'Move rect origin'
    );

    expect(isOperationBackedEditorCommand(command)).toBe(true);
    expect(command.resolveOperations(tree)).toEqual([
      { kind: 'svg.set-attribute', nodeId: rect.id, name: 'x', value: '12' },
      { kind: 'svg.set-attribute', nodeId: rect.id, name: 'y', value: '24' }
    ]);

    const changedRect = requireElement(command.apply(tree), rect.id);

    expect(getAttribute(changedRect, 'x', true)).toBe('12');
    expect(getAttribute(changedRect, 'y', true)).toBe('24');
  });

  it('duplicates nodes with fresh IDs through insert operations', () => {
    resetIdCounter();
    const root = createDefaultRoot();
    const rect = createDefaultElement('rect');
    const tree = appendChild(root, root.id, rect);
    const command = createDuplicateNodesCommand(tree, [rect.id]);
    const operations = command.resolveOperations(tree);

    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ kind: 'svg.insert-node', parentId: root.id, index: 1 });

    const changed = command.apply(tree);

    expect(changed.children).toHaveLength(2);
    expect(changed.children[0]?.id).toBe(rect.id);
    expect(changed.children[1]?.id).not.toBe(rect.id);
  });

  it('inserts a node after a target without hard-coding sibling mutation logic in callers', () => {
    resetIdCounter();
    const root = createDefaultRoot();
    const rect = createDefaultElement('rect');
    const circle = createDefaultElement('circle');
    const tree = appendChild(root, root.id, rect);
    const command = createInsertNodeAfterCommand({
      root: tree,
      targetId: rect.id,
      node: circle,
      label: 'Insert circle'
    });

    const changed = command.apply(tree);

    expect(changed.children.map((node) => node.id)).toEqual([rect.id, circle.id]);
  });

  it('creates add-node commands from selected document context', () => {
    resetIdCounter();
    const root = createDefaultRoot();
    const group = createElementNode('g');
    const tree = appendChild(root, root.id, group);
    const capabilities = {
      isValidChild: (parentName: string, childName: string) => parentName === 'g' && childName === 'rect',
      createElement: (name: string) => createElementNode(name)
    };
    const addRect = createAddElementCommand({
      root: tree,
      selectedNodes: [group],
      name: 'rect',
      capabilities
    });

    expect(addRect.command.resolveOperations(tree)).toMatchObject([
      { kind: 'svg.insert-node', parentId: group.id, index: 0 }
    ]);

    const withRect = addRect.command.apply(tree);
    const changedGroup = requireElement(withRect, group.id);

    expect(changedGroup.children[0]).toMatchObject({ id: addRect.nodeId, kind: 'element', name: 'rect' });

    const addComment = createAddTextNodeCommand({
      root: withRect,
      selectedNodes: [changedGroup],
      kind: 'comment'
    });

    expect(addComment.command.resolveOperations(withRect)).toMatchObject([
      { kind: 'svg.insert-node', parentId: group.id, index: 1, node: { id: addComment.nodeId, kind: 'comment' } }
    ]);
  });

  it('creates path-edit operations from the current root', () => {
    resetIdCounter();
    const root = createDefaultRoot();
    const path = createDefaultElement('path');
    const tree = appendChild(root, root.id, path);
    const command = createInsertPathCommandCommand({ nodeId: path.id, index: 0, command: 'L' });
    const changed = command.apply(tree);
    const changedPath = requireElement(changed, path.id);

    expect(getAttribute(changedPath, 'd', true)).toContain('L');
  });

  it('creates path insert intents from typed selection targets and key state', () => {
    resetIdCounter();
    const path = createElementNode('path', [{ name: 'd', value: 'M 0 0' }]);
    const tree = createElementNode('svg', [], [path]);
    const directIntent = createInsertPathCommandIntent({
      nodeId: path.id,
      index: 0,
      command: 'L'
    });
    const intent = createInsertPathCommandFromKeyIntent({
      selectionTargets: [pathCommandSelectionTarget(path.id, 0)],
      key: 'l',
      absolute: true
    });

    expect(directIntent.nextTarget).toEqual(pathCommandSelectionTarget(path.id, 1));
    expect(intent?.nextTarget).toEqual(pathCommandSelectionTarget(path.id, 1));
    expect(intent?.command.resolveOperations(tree)).toEqual([
      { kind: 'svg.set-attribute', nodeId: path.id, name: 'd', value: 'M 0 0 L 0 0' }
    ]);
    expect(createInsertPathCommandFromKeyIntent({ selectionTargets: [], key: 'l', absolute: false })).toBeUndefined();
  });

  it('creates path delete intents with the next surviving command target', () => {
    resetIdCounter();
    const path = createElementNode('path', [{ name: 'd', value: 'M 0 0 L 10 20 C 1 2 3 4 5 6' }]);
    const tree = createElementNode('svg', [], [path]);
    const middle = createDeletePathCommandIntent({ nodeId: path.id, commandIndex: 1, commandCount: 3 });
    const last = createDeletePathCommandIntent({ nodeId: path.id, commandIndex: 2, commandCount: 3 });
    const only = createDeletePathCommandIntent({ nodeId: path.id, commandIndex: 0, commandCount: 1 });

    expect(middle.nextTarget).toEqual(pathCommandSelectionTarget(path.id, 1));
    expect(last.nextTarget).toEqual(pathCommandSelectionTarget(path.id, 1));
    expect(only.nextTarget).toBeUndefined();
    expect(middle.command.resolveOperations(tree)).toEqual([
      { kind: 'svg.set-attribute', nodeId: path.id, name: 'd', value: 'M 0 0 C 1 2 3 4 5 6' }
    ]);
  });

  it('updates path command structure through operation-backed commands', () => {
    resetIdCounter();
    const path = createElementNode('path', [{ name: 'd', value: 'M 0 0 L 10 20' }]);
    const tree = createElementNode('svg', [], [path]);
    const toggle = createTogglePathCommandRelativeCommand({ nodeId: path.id, commandIndex: 1 });
    const convert = createConvertPathCommandCommand({ nodeId: path.id, commandIndex: 1, command: 'H' });
    const remove = createDeletePathCommandCommand({ nodeId: path.id, commandIndex: 1 });

    expect(toggle.resolveOperations(tree)).toEqual([
      { kind: 'svg.set-attribute', nodeId: path.id, name: 'd', value: 'M 0 0 l 10 20' }
    ]);
    expect(convert.resolveOperations(tree)).toEqual([
      { kind: 'svg.set-attribute', nodeId: path.id, name: 'd', value: 'M 0 0 H 10' }
    ]);
    expect(remove.resolveOperations(tree)).toEqual([
      { kind: 'svg.set-attribute', nodeId: path.id, name: 'd', value: 'M 0 0' }
    ]);
  });

  it('updates path anchors through operation-backed commands', () => {
    resetIdCounter();
    const path = createElementNode('path', [{ name: 'd', value: 'M 10 10 l 5 6' }]);
    const tree = createElementNode('svg', [], [path]);
    const command = createUpdatePathAnchorCommand({
      nodeId: path.id,
      commandIndex: 1,
      updates: [
        { parameter: 'x', value: 22 },
        { parameter: 'y', value: 25 }
      ]
    });

    expect(isOperationBackedEditorCommand(command)).toBe(true);
    expect(command.resolveOperations(tree)).toEqual([
      { kind: 'svg.set-attribute', nodeId: path.id, name: 'd', value: 'M 10 10 l 12 15' }
    ]);

    const changedPath = requireElement(command.apply(tree), path.id);

    expect(getAttribute(changedPath, 'd', true)).toBe('M 10 10 l 12 15');
  });

  it('updates points attributes through operation-backed commands', () => {
    resetIdCounter();
    const polyline = createElementNode('polyline', [{ name: 'points', value: '0 0 10 10 20 20' }]);
    const tree = createElementNode('svg', [], [polyline]);
    const command = createUpdatePointCommand({ nodeId: polyline.id, index: 1, x: 12, y: 24 });

    expect(isOperationBackedEditorCommand(command)).toBe(true);
    expect(command.resolveOperations(tree)).toEqual([
      { kind: 'svg.set-attribute', nodeId: polyline.id, name: 'points', value: '0 0 12 24 20 20' }
    ]);

    const changedPolyline = requireElement(command.apply(tree), polyline.id);

    expect(getAttribute(changedPolyline, 'points', true)).toBe('0 0 12 24 20 20');
  });

  it('adds and deletes points through operation-backed commands', () => {
    resetIdCounter();
    const polyline = createElementNode('polyline', [{ name: 'points', value: '0 0 10 10 20 20' }]);
    const tree = createElementNode('svg', [], [polyline]);
    const add = createAddPointCommand({ nodeId: polyline.id });
    const remove = createDeletePointCommand({ nodeId: polyline.id, index: 1 });

    expect(add.resolveOperations(tree)).toEqual([
      { kind: 'svg.set-attribute', nodeId: polyline.id, name: 'points', value: '0 0 10 10 20 20 60 60' }
    ]);
    expect(remove.resolveOperations(tree)).toEqual([
      { kind: 'svg.set-attribute', nodeId: polyline.id, name: 'points', value: '0 0 20 20' }
    ]);
  });

  it('optimizes the root through a root-replacement operation-backed command', () => {
    resetIdCounter();
    const comment = { id: createId(), kind: 'comment', text: ' remove me ' } satisfies SvgNode;
    const rect = createElementNode('rect', [{ name: 'fill', value: '' }]);
    const tree = createElementNode('svg', [], [comment, rect]);
    const command = createOptimizeSvgCommand(defaultSettings().optimizer);

    expect(isOperationBackedEditorCommand(command)).toBe(true);
    expect(command.resolveOperations(tree)).toEqual([
      {
        kind: 'svg.replace-root',
        root: {
          ...tree,
          children: [{ ...rect, attrs: [] }]
        }
      }
    ]);

    const changed = command.apply(tree);

    expect(changed.children).toEqual([{ ...rect, attrs: [] }]);
  });

  it('transforms selected elements through operation-backed commands', () => {
    resetIdCounter();
    const rect = createElementNode('rect');
    const group = createElementNode('g', [{ name: 'transform', value: 'scale(2)' }], [rect]);
    const tree = createElementNode('svg', [], [group]);
    const command = createTransformSelectedCommand({
      ids: [rect.id],
      transform: translateMatrix(10, 20),
      label: 'Move selection'
    });

    expect(isOperationBackedEditorCommand(command)).toBe(true);
    expect(command.resolveOperations(tree)).toEqual([
      { kind: 'svg.set-attribute', nodeId: rect.id, name: 'transform', value: 'matrix(1 0 0 1 5 10)' }
    ]);

    const changedRect = requireElement(command.apply(tree), rect.id);

    expect(getAttribute(changedRect, 'transform', true)).toBe('matrix(1 0 0 1 5 10)');
  });
});

function requireElement(root: SvgElementNode, id: string): SvgElementNode {
  const node = findNode(root, id);

  if (!node || node.kind !== 'element') {
    throw new Error(`Expected element ${id}`);
  }

  return node;
}
