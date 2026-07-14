import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { createSvgCapabilityRegistry } from '../src/editor/capabilities';
import { createEditorCommand } from '../src/editor/commands';
import { createSetAttributeCommand } from '../src/editor/commands/attributeCommands';
import { createReorderNodesCommand } from '../src/editor/commands/nodeCommands';
import type { SvgCapabilityContribution } from '../src/editor/kernel';
import { coreSvgCapabilityContribution } from '../src/editor/svg-capabilities/coreSvgContribution';
import { prettyFormatter } from '../src/formatter';
import { createEditorDocuments } from '../src/features/documents/createEditorDocuments';
import { appendChild, createDefaultElement, getAttribute, type SvgElementNode } from '../src/svg-model';

describe('createEditorDocuments command history', () => {
  it('dispatches commands through undo and redo', () => {
    createRoot((dispose) => {
      const documents = createEditorDocuments({
        formatter: () => prettyFormatter,
        onSelectionReset: () => undefined,
        onDocumentOpened: () => undefined,
        onParseError: () => undefined
      });
      const rect = createDefaultElement('rect');
      const historyLabels: Array<string | undefined> = [];

      documents.commandEvents.listen((event) => {
        if (event.type === 'history.undone' || event.type === 'history.redone') {
          historyLabels.push(event.label);
        }
      });

      documents.dispatchCommand(
        createEditorCommand({
          id: 'test.add-rect',
          label: 'Add rectangle',
          apply: (root) => appendChild(root, root.id, rect)
        })
      );

      expect(documents.activeRoot().children.map((node) => node.id)).toEqual([rect.id]);
      expect(documents.canUndo()).toBe(true);

      documents.undo();

      expect(documents.activeRoot().children).toHaveLength(0);
      expect(documents.canRedo()).toBe(true);

      documents.redo();

      expect(documents.activeRoot().children.map((node) => node.id)).toEqual([rect.id]);

      documents.undo();
      documents.redo();

      expect(documents.activeRoot().children.map((node) => node.id)).toEqual([rect.id]);
      expect(historyLabels).toEqual(['Add rectangle', 'Add rectangle', 'Add rectangle', 'Add rectangle']);
      dispose();
    });
  });

  it('squashes repeated transaction updates into one undo step', () => {
    createRoot((dispose) => {
      const documents = createEditorDocuments({
        formatter: () => prettyFormatter,
        onSelectionReset: () => undefined,
        onDocumentOpened: () => undefined,
        onParseError: () => undefined
      });
      const firstRect = createDefaultElement('rect');
      const finalCircle = createDefaultElement('circle');

      const transaction = documents.beginCommandTransaction();
      transaction?.update(
        createEditorCommand({
          id: 'test.drag-update',
          label: 'Drag update',
          apply: (root) => appendChild(root, root.id, firstRect)
        })
      );
      documents.updateCommandTransaction(
        createEditorCommand({
          id: 'test.drag-update',
          label: 'Drag update',
          apply: (root) => appendChild(root, root.id, finalCircle)
        })
      );
      documents.commitCommandTransaction();

      expect(documents.activeRoot().children.map((node) => node.id)).toEqual([finalCircle.id]);
      expect(documents.canUndo()).toBe(true);

      documents.undo();

      expect(documents.activeRoot().children).toHaveLength(0);
      expect(documents.canUndo()).toBe(false);
      dispose();
    });
  });

  it('merges repeated command updates with the same merge key into one undo step', () => {
    createRoot((dispose) => {
      const documents = createEditorDocuments({
        formatter: () => prettyFormatter,
        onSelectionReset: () => undefined,
        onDocumentOpened: () => undefined,
        onParseError: () => undefined
      });
      const rect = createDefaultElement('rect');

      documents.dispatchCommand(
        createEditorCommand({
          id: 'test.add-rect',
          label: 'Add rectangle',
          apply: (root) => appendChild(root, root.id, rect)
        })
      );
      documents.dispatchCommand(createSetAttributeCommand(rect.id, 'fill', 'red'));
      documents.dispatchCommand(createSetAttributeCommand(rect.id, 'fill', 'blue'));

      expect(getAttribute(childElementByName(documents.activeRoot(), 'rect'), 'fill', true)).toBe('blue');

      documents.undo();

      expect(getAttribute(childElementByName(documents.activeRoot(), 'rect'), 'fill', true)).toBe('');
      expect(documents.canUndo()).toBe(true);

      documents.redo();

      expect(getAttribute(childElementByName(documents.activeRoot(), 'rect'), 'fill', true)).toBe('blue');
      dispose();
    });
  });

  it('keeps command updates with different merge keys as separate undo steps', () => {
    createRoot((dispose) => {
      const documents = createEditorDocuments({
        formatter: () => prettyFormatter,
        onSelectionReset: () => undefined,
        onDocumentOpened: () => undefined,
        onParseError: () => undefined
      });
      const rect = createDefaultElement('rect');

      documents.dispatchCommand(
        createEditorCommand({
          id: 'test.add-rect',
          label: 'Add rectangle',
          apply: (root) => appendChild(root, root.id, rect)
        })
      );
      documents.dispatchCommand(createSetAttributeCommand(rect.id, 'fill', 'red'));
      documents.dispatchCommand(createSetAttributeCommand(rect.id, 'stroke', 'blue'));

      documents.undo();

      const updatedRect = childElementByName(documents.activeRoot(), 'rect');
      expect(getAttribute(updatedRect, 'fill', true)).toBe('red');
      expect(getAttribute(updatedRect, 'stroke', true)).toBe('');
      dispose();
    });
  });

  it('cancels transaction updates and restores redo history', () => {
    createRoot((dispose) => {
      const documents = createEditorDocuments({
        formatter: () => prettyFormatter,
        onSelectionReset: () => undefined,
        onDocumentOpened: () => undefined,
        onParseError: () => undefined
      });
      const events: string[] = [];
      documents.commandEvents.listen((event) => events.push(event.type));
      const rect = createDefaultElement('rect');
      const circle = createDefaultElement('circle');

      documents.dispatchCommand(
        createEditorCommand({
          id: 'test.add-rect',
          label: 'Add rectangle',
          apply: (root) => appendChild(root, root.id, rect)
        })
      );
      documents.undo();

      expect(documents.canRedo()).toBe(true);

      const transaction = documents.beginCommandTransaction();
      transaction?.update(
        createEditorCommand({
          id: 'test.drag-update',
          label: 'Drag update',
          apply: (root) => appendChild(root, root.id, circle)
        })
      );

      expect(documents.activeRoot().children.map((node) => node.id)).toEqual([circle.id]);
      expect(documents.canRedo()).toBe(false);
      expect(transaction?.changed()).toBe(true);

      transaction?.cancel();

      expect(documents.activeRoot().children).toHaveLength(0);
      expect(documents.canUndo()).toBe(false);
      expect(documents.canRedo()).toBe(true);
      expect(events).toContain('command.transaction.canceled');

      documents.redo();

      expect(documents.activeRoot().children.map((node) => node.id)).toEqual([rect.id]);
      dispose();
    });
  });

  it('uses injected SVG capabilities for parsing and operation-backed document commands', () => {
    createRoot((dispose) => {
      const extension = {
        id: 'test.svg',
        elements: [
          {
            name: 'badge',
            defaults: { tone: 'warm' },
            attributes: ['tone']
          },
          {
            name: 'slot',
            defaults: {},
            allowedChildren: ['badge'],
            attributes: []
          }
        ]
      } satisfies SvgCapabilityContribution;
      const documents = createEditorDocuments({
        capabilities: createSvgCapabilityRegistry([coreSvgCapabilityContribution, extension]),
        formatter: () => prettyFormatter,
        onSelectionReset: () => undefined,
        onDocumentOpened: () => undefined,
        onParseError: () => undefined
      });

      documents.applyCode('<svg><badge tone="warm"/><slot/></svg>');

      expect(documents.activeTab()?.parseError).toBeUndefined();
      expect(documents.activeDocument().diagnostics).toEqual([]);

      const badge = childElementByName(documents.activeRoot(), 'badge');
      const slot = childElementByName(documents.activeRoot(), 'slot');

      documents.dispatchCommand(createReorderNodesCommand([badge.id], slot.id, 'inside'));

      const updatedSlot = childElementByName(documents.activeRoot(), 'slot');

      expect(documents.activeDocument().diagnostics).toEqual([]);
      expect(updatedSlot.children.map((node) => (node.kind === 'element' ? node.name : node.kind))).toEqual(['badge']);

      documents.undo();

      expect(documents.activeRoot().children.map((node) => (node.kind === 'element' ? node.name : node.kind))).toEqual([
        'badge',
        'slot'
      ]);
      expect(childElementByName(documents.activeRoot(), 'slot').children).toEqual([]);

      documents.redo();

      expect(childElementByName(documents.activeRoot(), 'slot').children.map((node) => (node.kind === 'element' ? node.name : node.kind))).toEqual([
        'badge'
      ]);
      dispose();
    });
  });
});

function childElementByName(root: SvgElementNode, name: string): SvgElementNode {
  const child = root.children.find((node): node is SvgElementNode => node.kind === 'element' && node.name === name);

  if (!child) {
    throw new Error(`Expected ${name} child`);
  }

  return child;
}
