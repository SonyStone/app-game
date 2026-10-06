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

  it('reverts a cancelled transaction without leaving an undo step', () => {
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

    documents.beginCommandTransaction();
    documents.updateCommandTransaction(
      createEditorCommand({ id: 'test.drag-update', label: 'Drag update', apply: (root) => appendChild(root, root.id, rect) })
    );
    flush();

    expect(documents.activeRoot().children).toHaveLength(1);

    documents.cancelCommandTransaction();
    flush();

    expect(documents.activeRoot().children).toHaveLength(0);
    expect(documents.canUndo()).toBe(false);
    dispose();
  });

  it('merges consecutive commands with the same merge key into one undo step', () => {
    const { dispose, documents } = createRoot((dispose) => ({
      dispose,
      documents: createEditorDocuments({
        formatter: () => prettyFormatter,
        onSelectionReset: () => undefined,
        onDocumentOpened: () => undefined,
        onParseError: () => undefined
      })
    }));
    const setFill = (value: string, mergeKey?: string) => {
      documents.dispatchCommand(
        createEditorCommand({
          id: 'test.fill',
          label: 'Set fill',
          apply: (root) => ({ ...root, attrs: [...root.attrs.filter((attr) => attr.name !== 'fill'), { name: 'fill', value }] }),
          ...(mergeKey === undefined ? {} : { mergeKey })
        })
      );
      flush();
    };
    const fill = () => documents.activeRoot().attrs.find((attr) => attr.name === 'fill')?.value;

    setFill('#100', 'picker:1');
    setFill('#200', 'picker:1');
    setFill('#300', 'picker:1');
    setFill('#400', 'picker:2');

    documents.undo();
    flush();

    expect(fill()).toBe('#300');

    documents.undo();
    flush();

    expect(fill()).toBeUndefined();
    expect(documents.canUndo()).toBe(false);
    dispose();
  });

  it('undoes a run of code edits as one step', () => {
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
      createEditorCommand({ id: 'test.add-rect', label: 'Add rectangle', apply: (root) => appendChild(root, root.id, rect) })
    );
    flush();

    for (const code of [
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/><circle r="2"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/><circle r="2"/'
    ]) {
      documents.applyCode(code);
      flush();
    }

    expect(documents.activeTab()?.parseError).toBeDefined();
    expect(documents.activeRoot().children).toHaveLength(2);

    documents.undo();
    flush();

    expect(documents.activeRoot().children.map((node) => node.id)).toEqual([rect.id]);

    documents.undo();
    flush();

    expect(documents.activeRoot().children).toHaveLength(0);

    documents.redo();
    flush();
    documents.redo();
    flush();

    expect(documents.activeRoot().children).toHaveLength(2);
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

  it('opens text that fails to parse in its own tab', () => {
    let parseErrors = 0;
    const { dispose, documents } = createRoot((dispose) => ({
      dispose,
      documents: createEditorDocuments({
        formatter: () => prettyFormatter,
        onSelectionReset: () => undefined,
        onDocumentOpened: () => undefined,
        onParseError: () => {
          parseErrors += 1;
        }
      })
    }));
    const firstTab = documents.activeTab();

    documents.importSvgText('<svg><g></svg>', 'broken.svg');
    flush();

    expect(documents.tabs()[0]).toBe(firstTab);
    expect(documents.activeTab()).toMatchObject({ name: 'broken.svg', code: '<svg><g></svg>' });
    expect(documents.activeTab()?.parseError).toBeDefined();
    expect(parseErrors).toBe(1);
    dispose();
  });

  it('selects the right neighbor after closing the active tab, or the left one at the end', () => {
    const { dispose, documents } = createRoot((dispose) => ({
      dispose,
      documents: createEditorDocuments({
        formatter: () => prettyFormatter,
        onSelectionReset: () => undefined,
        onDocumentOpened: () => undefined,
        onParseError: () => undefined
      })
    }));

    documents.createNewTab();
    flush();
    documents.createNewTab();
    flush();
    const [first, second, third] = documents.tabs().map((item) => item.id);

    documents.selectTab(second!);
    flush();
    documents.closeTab(second!);
    flush();

    expect(documents.activeTabId()).toBe(third);

    documents.closeTab(third!);
    flush();

    expect(documents.activeTabId()).toBe(first);
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
