import type { Accessor } from 'solid-js';

import type { AppSettings, ShortcutBinding } from '../../editor/types';
import { createShortcutRegistry, formatBinding, pathCommandBindings, type ShortcutDescriptor } from './shortcutRegistry';

/**
 * Wires GodSVG's editor actions to the keyboard: each action in `editorActions` runs its handler when one of its
 * bindings (the user's edits from `overrides`, else the defaults) is pressed. Returns the key handler and the
 * descriptors, which the shortcut editor and the shortcut panel read.
 */
export function createEditorShortcuts(options: {
  readonly activeElement: Accessor<Element | null>;
  /** False while shortcuts must not run, such as when a dialog is open or a drag is in progress. */
  readonly enabled: Accessor<boolean>;
  /** User-edited bindings by action id, from the settings. */
  readonly overrides: Accessor<AppSettings['shortcutOverrides']>;
  /**
   * What each action does. A handler that returns `false` did not apply (Find with no search field on screen), so the
   * browser keeps the key press.
   */
  readonly handlers: Readonly<Record<EditorActionId, (event: KeyboardEvent | undefined) => boolean | void>>;
}) {
  const descriptors = editorActions.map((action) =>
    withOverrides(
      {
        id: action.id,
        category: action.category,
        action: action.label,
        defaultBindings: action.bindings,
        editable: action.id !== 'tool.insert-path-command',
        ...('allowInEditable' in action ? { allowInEditable: action.allowInEditable } : {}),
        run: (event) => options.handlers[action.id](event)
      },
      options.overrides
    )
  );
  const registry = createShortcutRegistry(descriptors, { activeElement: options.activeElement, enabled: options.enabled });

  return { onKeyDown: registry.onKeyDown, descriptors };
}

/** An editor action: its GodSVG category and label (an English msgid) and default key bindings. */
type EditorActionDefinition = {
  readonly id: string;
  readonly category: 'file' | 'edit' | 'view' | 'tool' | 'help';
  readonly label: string;
  readonly bindings: readonly ShortcutBinding[];
  /** Runs while a text field has focus (most file and view actions); editing actions leave the field's keys alone. */
  readonly allowInEditable?: boolean;
};

/**
 * GodSVG's actions in its order, with its default bindings. Where the browser keeps a binding for itself (Ctrl+T,
 * Ctrl+W, Ctrl+Tab) a second one that pages can receive follows it.
 */
export const editorActions = [
  { id: 'file.import', category: 'file', label: 'Import', bindings: [{ key: 'i', ctrl: true }, { key: 'o', ctrl: true }], allowInEditable: true },
  { id: 'file.export', category: 'file', label: 'Export', bindings: [{ key: 'e', ctrl: true }], allowInEditable: true },
  { id: 'file.save-svg', category: 'file', label: 'Save SVG', bindings: [{ key: 's', ctrl: true }], allowInEditable: true },
  { id: 'file.close-tab', category: 'file', label: 'Close tab', bindings: [{ key: 'w', ctrl: true }, { key: 'w', alt: true }], allowInEditable: true },
  { id: 'file.close-other-tabs', category: 'file', label: 'Close all other tabs', bindings: [], allowInEditable: true },
  { id: 'file.close-tabs-left', category: 'file', label: 'Close tabs to the left', bindings: [], allowInEditable: true },
  { id: 'file.close-tabs-right', category: 'file', label: 'Close tabs to the right', bindings: [], allowInEditable: true },
  { id: 'file.close-empty-tabs', category: 'file', label: 'Close empty tabs', bindings: [], allowInEditable: true },
  { id: 'file.close-saved-tabs', category: 'file', label: 'Close saved tabs', bindings: [], allowInEditable: true },
  { id: 'file.new-tab', category: 'file', label: 'Create a new tab', bindings: [{ key: 't', ctrl: true }, { key: 't', alt: true }], allowInEditable: true },
  {
    id: 'file.next-tab',
    category: 'file',
    label: 'Select the next tab',
    bindings: [{ key: 'Tab', ctrl: true }, { key: ']', alt: true }],
    allowInEditable: true
  },
  {
    id: 'file.previous-tab',
    category: 'file',
    label: 'Select the previous tab',
    bindings: [{ key: 'Tab', ctrl: true, shift: true }, { key: '[', alt: true }],
    allowInEditable: true
  },
  { id: 'file.optimize', category: 'file', label: 'Optimize', bindings: [{ key: 'o', ctrl: true, shift: true }], allowInEditable: true },
  { id: 'edit.copy-svg', category: 'file', label: 'Copy the SVG text', bindings: [{ key: 'c', ctrl: true, shift: true }], allowInEditable: true },
  // Undo and redo stay with the text field while one is focused, like GodSVG.
  { id: 'edit.undo', category: 'edit', label: 'Undo', bindings: [{ key: 'z', ctrl: true }] },
  { id: 'edit.redo', category: 'edit', label: 'Redo', bindings: [{ key: 'z', ctrl: true, shift: true }, { key: 'y', ctrl: true }] },
  { id: 'edit.select-all', category: 'edit', label: 'Select all', bindings: [{ key: 'a', ctrl: true }] },
  { id: 'edit.duplicate', category: 'edit', label: 'Duplicate', bindings: [{ key: 'd', ctrl: true }] },
  { id: 'edit.move-up', category: 'edit', label: 'Move up', bindings: [{ key: 'ArrowUp', ctrl: true }, { key: 'ArrowUp', alt: true }] },
  { id: 'edit.move-down', category: 'edit', label: 'Move down', bindings: [{ key: 'ArrowDown', ctrl: true }, { key: 'ArrowDown', alt: true }] },
  { id: 'edit.set-as-initial', category: 'edit', label: 'Set as initial', bindings: [] },
  { id: 'edit.reverse-order', category: 'edit', label: 'Reverse order', bindings: [] },
  { id: 'edit.delete', category: 'edit', label: 'Delete', bindings: [{ key: 'Delete' }, { key: 'Backspace' }] },
  { id: 'edit.clear-selection', category: 'edit', label: 'Clear selection', bindings: [{ key: 'Escape' }] },
  { id: 'edit.find', category: 'edit', label: 'Find', bindings: [{ key: 'f', ctrl: true }], allowInEditable: true },
  { id: 'edit.evaluate', category: 'edit', label: 'Evaluate', bindings: [{ key: 'e', ctrl: true, alt: true }], allowInEditable: true },
  { id: 'view.zoom-in', category: 'view', label: 'Zoom in', bindings: [{ key: '=', ctrl: true }], allowInEditable: true },
  { id: 'view.zoom-out', category: 'view', label: 'Zoom out', bindings: [{ key: '-', ctrl: true }], allowInEditable: true },
  { id: 'view.reset-zoom', category: 'view', label: 'Zoom reset', bindings: [{ key: '0', ctrl: true }], allowInEditable: true },
  { id: 'view.toggle-fullscreen', category: 'view', label: 'Toggle fullscreen', bindings: [{ key: 'F11' }, { key: 'Enter', alt: true }], allowInEditable: true },
  { id: 'view.debug', category: 'view', label: 'View debug information', bindings: [{ key: 'F3' }], allowInEditable: true },
  { id: 'view.toggle-grid', category: 'view', label: 'Show grid', bindings: [{ key: 'g', ctrl: true, shift: true }], allowInEditable: true },
  { id: 'view.toggle-handles', category: 'view', label: 'Show handles', bindings: [{ key: 'h', ctrl: true, shift: true }], allowInEditable: true },
  { id: 'view.show-rasterized', category: 'view', label: 'Show rasterized SVG', bindings: [{ key: 'r', ctrl: true, shift: true }], allowInEditable: true },
  { id: 'view.load-reference', category: 'view', label: 'Load reference image', bindings: [], allowInEditable: true },
  { id: 'view.show-reference', category: 'view', label: 'Show reference image', bindings: [], allowInEditable: true },
  { id: 'view.overlay-reference', category: 'view', label: 'Overlay reference image', bindings: [], allowInEditable: true },
  { id: 'tool.toggle-snap', category: 'tool', label: 'Toggle snapping', bindings: [{ key: 's', alt: true }], allowInEditable: true },
  { id: 'tool.insert-path-command', category: 'tool', label: 'Insert path command', bindings: pathCommandBindings() },
  { id: 'help.settings', category: 'help', label: 'Settings', bindings: [{ key: ',', ctrl: true }], allowInEditable: true },
  { id: 'help.about', category: 'help', label: 'About…', bindings: [], allowInEditable: true },
  { id: 'help.donate', category: 'help', label: 'Donate…', bindings: [], allowInEditable: true },
  { id: 'help.repository', category: 'help', label: 'GodSVG repository', bindings: [], allowInEditable: true },
  { id: 'help.website', category: 'help', label: 'GodSVG website', bindings: [], allowInEditable: true }
] as const satisfies readonly EditorActionDefinition[];

/** The id of one of GodSVG's editor actions. */
export type EditorActionId = (typeof editorActions)[number]['id'];

/** Adds the current bindings (the user's edits, else the defaults) and their label, read on access. */
function withOverrides(
  base: Omit<ShortcutDescriptor, 'bindings' | 'keys'>,
  overrides: Accessor<AppSettings['shortcutOverrides']>
): ShortcutDescriptor {
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
