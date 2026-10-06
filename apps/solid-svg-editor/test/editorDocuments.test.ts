import { createRoot, flush } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { createEditorCommand } from '../src/editor/commands';
import { createEditorDocuments } from '../src/features/documents/createEditorDocuments';
import { prettyFormatter } from '../src/formatter';
import { appendChild, createDefaultElement, type SvgNode } from '../src/svg-model';

describe('createEditorDocuments command history', () => {
  it('dispatches commands through undo and redo', () => {
    const { dispose, documents } = createRoot((dispose) => ({
      dispose,
      documents: createEditorDocuments({
        formatter: () => prettyFormatter,
        onSelectionReset: () => undefined,
        onDocumentOpened: () => undefined,
        onParseError: () => undefined
      })
    }));
    const rect = createDefaultElement('rect');

    documents.dispatchCommand(
      createEditorCommand({
        id: 'test.add-rect',
        label: 'Add rectangle',
        apply: (root) => appendChild(root, root.id, rect)
      })
    );
    flush();

    expect(documents.activeRoot().children.map((node) => node.id)).toEqual([rect.id]);
    expect(documents.canUndo()).toBe(true);

    documents.undo();
    flush();

    expect(documents.activeRoot().children).toHaveLength(0);
    expect(documents.canRedo()).toBe(true);

    documents.redo();
    flush();

    expect(documents.activeRoot().children.map((node) => node.id)).toEqual([rect.id]);
    dispose();
  });

  it('squashes repeated transaction updates into one undo step', () => {
    const { dispose, documents } = createRoot((dispose) => ({
      dispose,
      documents: createEditorDocuments({
        formatter: () => prettyFormatter,
        onSelectionReset: () => undefined,
        onDocumentOpened: () => undefined,
        onParseError: () => undefined
      })
    }));
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
    flush();

    expect(documents.activeRoot().children.map((node) => node.id)).toEqual([finalCircle.id]);
    expect(documents.canUndo()).toBe(true);

    documents.undo();
    flush();

    expect(documents.activeRoot().children).toHaveLength(0);
    expect(documents.canUndo()).toBe(false);
    dispose();
  });

  it('gives every node and tab a unique id across imports', () => {
    const { dispose, documents } = createRoot((dispose) => ({
      dispose,
      documents: createEditorDocuments({
        formatter: () => prettyFormatter,
        onSelectionReset: () => undefined,
        onDocumentOpened: () => undefined,
        onParseError: () => undefined
      })
    }));
    const markup = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';

    documents.importSvgText(markup, 'a.svg');
    documents.importSvgText(markup, 'b.svg');
    flush();

    const nodeIds = documents.tabs().flatMap((tab) => collectIds(tab.document.root));
    const tabIds = documents.tabs().map((tab) => tab.id);

    expect(documents.tabs()).toHaveLength(3);
    expect(new Set([...nodeIds, ...tabIds]).size).toBe(nodeIds.length + tabIds.length);
    dispose();
  });

  it('resets the selection when switching or closing tabs', () => {
    let selectionResets = 0;
    const { dispose, documents } = createRoot((dispose) => ({
      dispose,
      documents: createEditorDocuments({
        formatter: () => prettyFormatter,
        onSelectionReset: () => {
          selectionResets += 1;
        },
        onDocumentOpened: () => undefined,
        onParseError: () => undefined
      })
    }));
    const firstTabId = documents.activeTabId();

    documents.createNewTab();
    flush();
    const secondTabId = documents.activeTabId();
    selectionResets = 0;

    documents.selectTab(firstTabId);
    flush();

    expect(documents.activeTabId()).toBe(firstTabId);
    expect(selectionResets).toBe(1);

    documents.closeTab(firstTabId);
    flush();

    expect(documents.activeTabId()).toBe(secondTabId);
    expect(selectionResets).toBe(2);
    dispose();
  });
});

function collectIds(node: SvgNode): string[] {
  return node.kind === 'element' ? [node.id, ...node.children.flatMap(collectIds)] : [node.id];
}
