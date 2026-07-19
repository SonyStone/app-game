import type { Accessor } from 'solid-js';

import { createShortcutRegistry, pathCommandBindings, type ShortcutDescriptor } from './shortcutRegistry';

export function createEditorShortcuts(options: {
  readonly activeElement: Accessor<Element | null>;
  readonly redo: () => void;
  readonly undo: () => void;
  readonly downloadSvg: () => void;
  readonly copySvgText: () => void;
  readonly openImportDialog: () => void;
  readonly openExport: () => void;
  readonly createNewTab: () => void;
  readonly openSettings: () => void;
  readonly optimizeActive: () => void;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly centerFrame: () => void;
  readonly toggleGrid: () => void;
  readonly toggleHandles: () => void;
  readonly selectAll: () => void;
  readonly duplicateSelected: () => void;
  readonly deleteSelected: () => void;
  readonly moveSelected: (direction: -1 | 1) => void;
  readonly insertPathCommandFromKey: (key: string, absolute: boolean) => void;
}) {
  const shortcuts = [
    shortcut('edit.undo', 'edit', 'Undo', 'Ctrl+Z', [{ key: 'z', ctrl: true }], options.undo, true),
    shortcut('edit.redo', 'edit', 'Redo', 'Ctrl+Shift+Z', [{ key: 'z', ctrl: true, shift: true }], options.redo, true),
    shortcut('file.save-svg', 'file', 'Save SVG', 'Ctrl+S', [{ key: 's', ctrl: true }], options.downloadSvg, true),
    shortcut('edit.copy-svg', 'edit', 'Copy SVG text', 'Ctrl+Shift+C', [{ key: 'c', ctrl: true, shift: true }], options.copySvgText, true),
    shortcut('file.import', 'file', 'Import', 'Ctrl+O', [{ key: 'o', ctrl: true }], options.openImportDialog, true),
    shortcut('file.export', 'file', 'Export', 'Ctrl+E', [{ key: 'e', ctrl: true }], options.openExport, true),
    shortcut('file.new-tab', 'file', 'New tab', 'Ctrl+N', [{ key: 'n', ctrl: true }], options.createNewTab, true),
    shortcut('file.optimize', 'file', 'Optimize', 'Ctrl+Shift+O', [{ key: 'o', ctrl: true, shift: true }], options.optimizeActive, true),
    shortcut('help.settings', 'help', 'Settings', 'Ctrl+,', [{ key: ',', ctrl: true }], options.openSettings, true),
    shortcut('view.zoom-in', 'view', 'Zoom in', 'Ctrl+=', [{ key: '=', ctrl: true }], options.zoomIn, true),
    shortcut('view.zoom-out', 'view', 'Zoom out', 'Ctrl+-', [{ key: '-', ctrl: true }], options.zoomOut, true),
    shortcut('view.reset-zoom', 'view', 'Reset zoom', 'Ctrl+0', [{ key: '0', ctrl: true }], options.centerFrame, true),
    shortcut('view.toggle-grid', 'view', 'Toggle grid', 'Ctrl+G', [{ key: 'g', ctrl: true }], options.toggleGrid, true),
    shortcut('view.toggle-handles', 'view', 'Toggle handles', 'Ctrl+H', [{ key: 'h', ctrl: true }], options.toggleHandles, true),
    shortcut('edit.select-all', 'edit', 'Select all', 'Ctrl+A', [{ key: 'a', ctrl: true }], options.selectAll),
    shortcut('edit.duplicate', 'edit', 'Duplicate', 'Ctrl+D', [{ key: 'd', ctrl: true }], options.duplicateSelected),
    shortcut('edit.delete', 'edit', 'Delete', 'Delete', [{ key: 'Delete' }, { key: 'Backspace' }], options.deleteSelected),
    shortcut('edit.move-up', 'edit', 'Move up', 'Alt+ArrowUp', [{ key: 'ArrowUp', alt: true }], () => options.moveSelected(-1)),
    shortcut('edit.move-down', 'edit', 'Move down', 'Alt+ArrowDown', [{ key: 'ArrowDown', alt: true }], () => options.moveSelected(1)),
    shortcut('tool.insert-path-command', 'tool', 'Insert path command', 'M L H V Z A Q T C S', pathCommandBindings(), (event) =>
      options.insertPathCommandFromKey(event.key, event.shiftKey)
    )
  ] as const satisfies readonly ShortcutDescriptor[];

  return createShortcutRegistry(shortcuts, { activeElement: options.activeElement });
}

function shortcut(
  id: string,
  category: string,
  action: string,
  keys: string,
  bindings: ShortcutDescriptor['bindings'],
  run: (event: KeyboardEvent) => void,
  allowInEditable?: boolean
): ShortcutDescriptor {
  if (allowInEditable === undefined) {
    return { id, category, action, keys, bindings, run };
  }

  return { id, category, action, keys, bindings, run, allowInEditable };
}
