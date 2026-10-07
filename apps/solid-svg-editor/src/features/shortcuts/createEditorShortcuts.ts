import type { Accessor } from 'solid-js';

import type { AppSettings } from '../../editor/types';
import { createShortcutRegistry, formatBinding, pathCommandBindings, type ShortcutDescriptor } from './shortcutRegistry';

export function createEditorShortcuts(options: {
  readonly activeElement: Accessor<Element | null>;
  /** False while shortcuts must not run, such as when a dialog is open or a drag is in progress. */
  readonly enabled: Accessor<boolean>;
  /** User-edited bindings by action id, from the settings. */
  readonly overrides: Accessor<AppSettings['shortcutOverrides']>;
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
  /** Escape: clears the selected path commands, or the selected nodes when there are none. */
  readonly clearSelection: () => void;
  readonly duplicateSelected: () => void;
  readonly deleteSelected: () => void;
  readonly moveSelected: (direction: -1 | 1) => void;
  readonly insertPathCommandFromKey: (key: string, absolute: boolean) => void;
}) {
  const shortcuts = [
    // Undo and redo stay with the text field while one is focused, like GodSVG.
    shortcut('edit.undo', 'edit', 'Undo', [{ key: 'z', ctrl: true }], options.undo),
    shortcut('edit.redo', 'edit', 'Redo', [{ key: 'z', ctrl: true, shift: true }], options.redo),
    shortcut('file.save-svg', 'file', 'Save SVG', [{ key: 's', ctrl: true }], options.downloadSvg, true),
    shortcut('edit.copy-svg', 'edit', 'Copy the SVG text', [{ key: 'c', ctrl: true, shift: true }], options.copySvgText, true),
    shortcut('file.import', 'file', 'Import', [{ key: 'o', ctrl: true }], options.openImportDialog, true),
    shortcut('file.export', 'file', 'Export', [{ key: 'e', ctrl: true }], options.openExport, true),
    shortcut('file.new-tab', 'file', 'Create a new tab', [{ key: 'n', ctrl: true }], options.createNewTab, true),
    shortcut('file.optimize', 'file', 'Optimize', [{ key: 'o', ctrl: true, shift: true }], options.optimizeActive, true),
    shortcut('help.settings', 'help', 'Settings', [{ key: ',', ctrl: true }], options.openSettings, true),
    shortcut('view.zoom-in', 'view', 'Zoom in', [{ key: '=', ctrl: true }], options.zoomIn, true),
    shortcut('view.zoom-out', 'view', 'Zoom out', [{ key: '-', ctrl: true }], options.zoomOut, true),
    shortcut('view.reset-zoom', 'view', 'Zoom reset', [{ key: '0', ctrl: true }], options.centerFrame, true),
    shortcut('view.toggle-grid', 'view', 'Show grid', [{ key: 'g', ctrl: true }], options.toggleGrid, true),
    shortcut('view.toggle-handles', 'view', 'Show handles', [{ key: 'h', ctrl: true }], options.toggleHandles, true),
    shortcut('edit.select-all', 'edit', 'Select all', [{ key: 'a', ctrl: true }], options.selectAll),
    shortcut('edit.clear-selection', 'edit', 'Clear selection', [{ key: 'Escape' }], options.clearSelection),
    shortcut('edit.duplicate', 'edit', 'Duplicate', [{ key: 'd', ctrl: true }], options.duplicateSelected),
    shortcut('edit.delete', 'edit', 'Delete', [{ key: 'Delete' }, { key: 'Backspace' }], options.deleteSelected),
    shortcut('edit.move-up', 'edit', 'Move up', [{ key: 'ArrowUp', alt: true }], () => options.moveSelected(-1)),
    shortcut('edit.move-down', 'edit', 'Move down', [{ key: 'ArrowDown', alt: true }], () => options.moveSelected(1)),
    shortcut('tool.insert-path-command', 'tool', 'Insert path command', pathCommandBindings(), (event) =>
      options.insertPathCommandFromKey(event.key, event.shiftKey)
    )
  ];
  const descriptors = shortcuts.map((item) => withOverrides(item, options.overrides));
  const registry = createShortcutRegistry(descriptors, { activeElement: options.activeElement, enabled: options.enabled });

  return { onKeyDown: registry.onKeyDown, descriptors };
}

type BaseShortcut = Omit<ShortcutDescriptor, 'bindings' | 'keys'>;

function shortcut(
  id: string,
  category: string,
  action: string,
  bindings: ShortcutDescriptor['bindings'],
  run: (event: KeyboardEvent) => void,
  allowInEditable?: boolean
): BaseShortcut {
  const base = { id, category, action, defaultBindings: bindings, editable: id !== 'tool.insert-path-command', run };
  return allowInEditable === undefined ? base : { ...base, allowInEditable };
}

/** Adds the current bindings (the user's edits, else the defaults) and their label, read on access. */
function withOverrides(base: BaseShortcut, overrides: Accessor<AppSettings['shortcutOverrides']>): ShortcutDescriptor {
  const bindings = () => (base.editable ? (overrides()[base.id] ?? base.defaultBindings) : base.defaultBindings);
  return {
    ...base,
    get bindings() {
      return bindings();
    },
    get keys() {
      return base.editable ? bindings().map(formatBinding).join(', ') : 'M L H V Z A Q T C S';
    }
  };
}
