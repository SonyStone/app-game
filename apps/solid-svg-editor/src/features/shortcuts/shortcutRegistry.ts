import { pathCommandLetters } from '../../path-data';
import { createEditorRegistries } from '../../editor/contributions';
import type {
  EditorContribution,
  ShortcutBinding,
  ShortcutContribution,
  ShortcutTarget
} from '../../editor/kernel';
import type { ShortcutItem } from '../../editor/types';
import type { Accessor } from 'solid-js';

export interface ShortcutDescriptor extends ShortcutContribution {
  readonly run: (event: KeyboardEvent) => void;
}

export type ShortcutRegistryContribution = EditorContribution & {
  readonly shortcuts?: readonly ShortcutContribution[];
};

export const coreShortcutContribution = {
  id: 'core.shortcuts',
  shortcuts: [
    shortcutContribution('file.import', actionTarget('file.import'), 'file', 'Import', 'Ctrl+O', [{ key: 'o', ctrl: true }], {
      allowInEditable: true
    }),
    shortcutContribution('file.export', actionTarget('file.export'), 'file', 'Export', 'Ctrl+E', [{ key: 'e', ctrl: true }], {
      allowInEditable: true
    }),
    shortcutContribution('file.save-svg', actionTarget('file.save-svg'), 'file', 'Save SVG', 'Ctrl+S', [{ key: 's', ctrl: true }], {
      allowInEditable: true
    }),
    shortcutContribution('file.new-tab', actionTarget('file.new-tab'), 'file', 'New tab', 'Ctrl+N', [{ key: 'n', ctrl: true }], {
      allowInEditable: true
    }),
    shortcutContribution('file.optimize', commandTarget('svg.optimize'), 'file', 'Optimize', 'Ctrl+Shift+O', [{ key: 'o', ctrl: true, shift: true }], {
      allowInEditable: true
    }),
    shortcutContribution('edit.undo', actionTarget('edit.undo'), 'edit', 'Undo', 'Ctrl+Z', [{ key: 'z', ctrl: true }], {
      allowInEditable: true
    }),
    shortcutContribution('edit.redo', actionTarget('edit.redo'), 'edit', 'Redo', 'Ctrl+Shift+Z', [{ key: 'z', ctrl: true, shift: true }], {
      allowInEditable: true
    }),
    shortcutContribution('edit.copy-svg', actionTarget('edit.copy-svg'), 'edit', 'Copy SVG text', 'Ctrl+Shift+C', [{ key: 'c', ctrl: true, shift: true }], {
      allowInEditable: true
    }),
    shortcutContribution('edit.duplicate', commandTarget('svg.duplicate-selection'), 'edit', 'Duplicate', 'Ctrl+D', [{ key: 'd', ctrl: true }]),
    shortcutContribution('edit.delete', commandTarget('svg.delete-selection'), 'edit', 'Delete', 'Delete', [
      { key: 'Delete' },
      { key: 'Backspace' }
    ]),
    shortcutContribution('edit.move-up', commandTarget('svg.move-selection-up'), 'edit', 'Move up', 'Alt+ArrowUp', [
      { key: 'ArrowUp', alt: true }
    ]),
    shortcutContribution('edit.move-down', commandTarget('svg.move-selection-down'), 'edit', 'Move down', 'Alt+ArrowDown', [
      { key: 'ArrowDown', alt: true }
    ]),
    shortcutContribution('edit.select-all', actionTarget('edit.select-all'), 'edit', 'Select all', 'Ctrl+A', [
      { key: 'a', ctrl: true }
    ]),
    shortcutContribution('command.palette', actionTarget('command.palette'), 'command', 'Command palette', 'Ctrl+K', [{ key: 'k', ctrl: true }], {
      allowInEditable: true
    }),
    shortcutContribution('view.zoom-in', actionTarget('view.zoom-in'), 'view', 'Zoom in', 'Ctrl+=', [{ key: '=', ctrl: true }], {
      allowInEditable: true
    }),
    shortcutContribution('view.zoom-out', actionTarget('view.zoom-out'), 'view', 'Zoom out', 'Ctrl+-', [{ key: '-', ctrl: true }], {
      allowInEditable: true
    }),
    shortcutContribution('view.reset-zoom', actionTarget('view.reset-zoom'), 'view', 'Reset zoom', 'Ctrl+0', [{ key: '0', ctrl: true }], {
      allowInEditable: true
    }),
    shortcutContribution('view.toggle-grid', actionTarget('view.toggle-grid'), 'view', 'Toggle grid', 'Ctrl+G', [{ key: 'g', ctrl: true }], {
      allowInEditable: true
    }),
    shortcutContribution('view.toggle-handles', actionTarget('view.toggle-handles'), 'view', 'Toggle handles', 'Ctrl+H', [{ key: 'h', ctrl: true }], {
      allowInEditable: true
    }),
    shortcutContribution(
      'tool.insert-path-command',
      handlerTarget('tool.insert-path-command'),
      'tool',
      'Insert path command',
      'M L H V Z A Q T C S',
      pathCommandBindings()
    ),
    shortcutContribution('help.settings', actionTarget('help.settings'), 'help', 'Settings', 'Ctrl+,', [{ key: ',', ctrl: true }], {
      allowInEditable: true
    })
  ]
} as const satisfies ShortcutRegistryContribution;

export const defaultShortcutItems = shortcutItemsFromContributions();

export function shortcutContributionsFromContributions(
  contributions: readonly ShortcutRegistryContribution[] = [coreShortcutContribution]
): readonly ShortcutContribution[] {
  return createEditorRegistries(contributions).shortcuts;
}

export function shortcutItemsFromContributions(
  contributions: readonly ShortcutRegistryContribution[] = [coreShortcutContribution]
): readonly ShortcutItem[] {
  return shortcutItemsFromShortcuts(shortcutContributionsFromContributions(contributions));
}

export function shortcutItemsFromShortcuts(shortcuts: readonly ShortcutContribution[]): readonly ShortcutItem[] {
  return shortcuts.map(({ category, action, keys }) => ({
    category,
    action,
    keys
  }));
}

export function createShortcutRegistry(
  descriptors: readonly ShortcutDescriptor[],
  options: { readonly activeElement?: Accessor<Element | null> } = {}
) {
  function onKeyDown(event: KeyboardEvent): void {
    const target = event.target ?? options.activeElement?.();
    const editing = isEditableTarget(target);
    const descriptor = descriptors.find((item) =>
      (!editing || item.allowInEditable === true) && item.bindings.some((binding) => matchesBinding(event, binding))
    );

    if (!descriptor) {
      return;
    }

    event.preventDefault();
    descriptor.run(event);
  }

  return { onKeyDown };
}

export function pathCommandBindings(): readonly ShortcutBinding[] {
  return pathCommandLetters.flatMap((letter) => [{ key: letter }, { key: letter, shift: true }]);
}

function shortcutContribution(
  id: ShortcutContribution['id'],
  target: ShortcutTarget,
  category: string,
  action: string,
  keys: string,
  bindings: readonly ShortcutBinding[],
  options: {
    readonly allowInEditable?: boolean;
  } = {}
): ShortcutContribution {
  const base = {
    id,
    target,
    category,
    action,
    keys,
    bindings
  } satisfies ShortcutContribution;

  if (options.allowInEditable === undefined) {
    return base;
  }

  return { ...base, allowInEditable: options.allowInEditable };
}

function actionTarget(id: ShortcutTarget['id']): ShortcutTarget {
  return { kind: 'action', id };
}

function commandTarget(id: ShortcutTarget['id']): ShortcutTarget {
  return { kind: 'command', id };
}

function handlerTarget(id: ShortcutTarget['id']): ShortcutTarget {
  return { kind: 'handler', id };
}

function matchesBinding(event: KeyboardEvent, binding: ShortcutBinding): boolean {
  if (!sameKey(event.key, binding.key)) {
    return false;
  }

  if ((event.ctrlKey || event.metaKey) !== (binding.ctrl ?? false)) {
    return false;
  }

  if (event.shiftKey !== (binding.shift ?? false)) {
    return false;
  }

  return event.altKey === (binding.alt ?? false);
}

function sameKey(actual: string, expected: string): boolean {
  if (expected.length === 1) {
    return actual.toLowerCase() === expected.toLowerCase();
  }

  return actual === expected;
}

function isEditableTarget(target: EventTarget | Element | null | undefined): boolean {
  if (!isMatchableTarget(target)) {
    return false;
  }

  return target.matches("input, textarea, select, [contenteditable='true']");
}

function isMatchableTarget(target: unknown): target is { matches: (selector: string) => boolean } {
  return typeof target === 'object' && target !== null && 'matches' in target && typeof target.matches === 'function';
}
