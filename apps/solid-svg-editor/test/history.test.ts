import { describe, expect, it } from 'vitest';

import { svgCapabilities } from '../src/editor/capabilities';
import { createLegacyEditorCommand } from '../src/editor/commands';
import { createSetAttributeCommand } from '../src/editor/commands/attributeCommands';
import { createReorderNodesCommand } from '../src/editor/commands/nodeCommands';
import { applyEditorOperations, type EditorOperation } from '../src/editor/operations';
import {
  createHistoryEntry,
  restoreRedoRoot,
  restoreUndoRoot
} from '../src/editor/history';
import type { HistoryEntry } from '../src/editor/types';
import {
  appendChild,
  createDefaultElement,
  createDefaultRoot,
  resetIdCounter
} from '../src/svg-model';

describe('history metadata', () => {
  it('records operations and inverse operations for operation-backed commands', () => {
    resetIdCounter();
    const root = createDefaultRoot();
    const rect = svgCapabilities.createElement('rect');
    const tree = appendChild(root, root.id, rect);
    const command = createSetAttributeCommand(rect.id, 'fill', 'red');

    const entry = createHistoryEntry(tree, command);

    expect(entry.commandId).toBe('svg.set-attribute');
    expect(entry.durability).toEqual({ kind: 'operation' });
    expect(entry.beforeRoot).toEqual(tree);
    expect(entry.afterRoot).toEqual(command.apply(tree));
    expect(entry.operations).toEqual([
      { kind: 'svg.set-attribute', nodeId: rect.id, name: 'fill', value: 'red' }
    ]);
    expect(entry.inverseOperations).toEqual([
      { kind: 'svg.set-attribute', nodeId: rect.id, name: 'fill', value: 'white' }
    ]);
  });

  it('records inverse operations for operation-backed reorder commands', () => {
    resetIdCounter();
    const root = createDefaultRoot();
    const rect = createDefaultElement('rect');
    const circle = createDefaultElement('circle');
    const tree = appendChild(appendChild(root, root.id, rect), root.id, circle);
    const command = createReorderNodesCommand([rect.id], circle.id, 'after');

    const entry = createHistoryEntry(tree, command);

    expect(entry.commandId).toBe('svg.reorder-nodes');
    expect(entry.beforeRoot).toEqual(tree);
    expect(entry.afterRoot.children.map((node) => node.id)).toEqual([circle.id, rect.id]);
    expect(entry.operations).toEqual([
      {
        kind: 'svg.move-nodes',
        nodeIds: [rect.id],
        targetId: circle.id,
        position: 'after'
      }
    ]);
    expect(entry.inverseOperations).toEqual([
      {
        kind: 'svg.restore-node-locations',
        locations: [{ nodeId: rect.id, parentId: root.id, index: 0 }]
      }
    ]);
  });

  it('prefers operation replay over snapshots when restoring history entries', () => {
    resetIdCounter();
    const root = createDefaultRoot();
    const rect = createDefaultElement('rect');
    const before = appendChild(root, root.id, rect);
    const misleadingSnapshot = appendChild(before, before.id, createDefaultElement('circle'));
    const setFill = {
      kind: 'svg.set-attribute',
      nodeId: rect.id,
      name: 'fill',
      value: 'red'
    } satisfies EditorOperation;
    const removeFill = {
      kind: 'svg.remove-attribute',
      nodeId: rect.id,
      name: 'fill'
    } satisfies EditorOperation;
    const after = applyEditorOperations(before, [setFill]);
    const entry = {
      beforeRoot: before,
      afterRoot: after,
      root: misleadingSnapshot,
      commandId: 'test.set-fill',
      label: 'Set fill',
      operations: [setFill],
      inverseOperations: [removeFill]
    } satisfies HistoryEntry;

    expect(restoreUndoRoot(after, entry)).toEqual(before);
    expect(restoreRedoRoot(before, entry)).toEqual(after);
  });

  it('restores legacy snapshot-backed commands from explicit before and after roots', () => {
    resetIdCounter();
    const root = createDefaultRoot();
    const rect = createDefaultElement('rect');
    const circle = createDefaultElement('circle');
    const command = createLegacyEditorCommand(
      {
        id: 'test.add-rect',
        label: 'Add rect',
        apply: (current: typeof root) => appendChild(current, current.id, rect)
      },
      'Test fixture exercises snapshot-backed legacy command history.'
    );
    const createdEntry = createHistoryEntry(root, command);
    const misleadingSnapshot = appendChild(root, root.id, circle);
    const entry = {
      ...createdEntry,
      root: misleadingSnapshot
    } satisfies HistoryEntry;

    expect(entry.operations).toBeUndefined();
    expect(entry.inverseOperations).toBeUndefined();
    expect(entry.beforeRoot).toEqual(root);
    expect(entry.afterRoot.children.map((node) => node.id)).toEqual([rect.id]);
    expect(entry.durability).toEqual({
      kind: 'legacy',
      reason: 'Test fixture exercises snapshot-backed legacy command history.'
    });
    expect(restoreUndoRoot(entry.afterRoot, entry)).toEqual(root);
    expect(restoreRedoRoot(root, entry)).toEqual(entry.afterRoot);
  });
});
