import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { createEditorCommand } from '../src/editor/commands';
import { prettyFormatter } from '../src/formatter';
import { createEditorDocuments } from '../src/features/documents/createEditorDocuments';
import { appendChild, createDefaultElement } from '../src/svg-model';

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

      documents.beginCommandTransaction();
      documents.updateCommandTransaction(
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
});
