import { pathCommandLetters } from '../../path-data';
import type { ShortcutItem } from '../../editor/types';
import type { Accessor } from 'solid-js';

export interface ShortcutBinding {
  readonly key: string;
  readonly ctrl?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
}

export interface ShortcutDescriptor extends ShortcutItem {
  readonly id: string;
  readonly bindings: readonly ShortcutBinding[];
  readonly allowInEditable?: boolean;
  readonly run: (event: KeyboardEvent) => void;
}

export const defaultShortcutItems = [
  { category: 'file', action: 'Import', keys: 'Ctrl+O' },
  { category: 'file', action: 'Export', keys: 'Ctrl+E' },
  { category: 'file', action: 'Save SVG', keys: 'Ctrl+S' },
  { category: 'file', action: 'New tab', keys: 'Ctrl+N' },
  { category: 'file', action: 'Optimize', keys: 'Ctrl+Shift+O' },
  { category: 'edit', action: 'Undo', keys: 'Ctrl+Z' },
  { category: 'edit', action: 'Redo', keys: 'Ctrl+Shift+Z' },
  { category: 'edit', action: 'Copy SVG text', keys: 'Ctrl+Shift+C' },
  { category: 'edit', action: 'Duplicate', keys: 'Ctrl+D' },
  { category: 'edit', action: 'Delete', keys: 'Delete' },
  { category: 'edit', action: 'Move up', keys: 'Alt+ArrowUp' },
  { category: 'edit', action: 'Move down', keys: 'Alt+ArrowDown' },
  { category: 'edit', action: 'Select all', keys: 'Ctrl+A' },
  { category: 'view', action: 'Zoom in', keys: 'Ctrl+=' },
  { category: 'view', action: 'Zoom out', keys: 'Ctrl+-' },
  { category: 'view', action: 'Reset zoom', keys: 'Ctrl+0' },
  { category: 'view', action: 'Toggle grid', keys: 'Ctrl+G' },
  { category: 'view', action: 'Toggle handles', keys: 'Ctrl+H' },
  { category: 'tool', action: 'Insert path command', keys: 'M L H V Z A Q T C S' },
  { category: 'help', action: 'Settings', keys: 'Ctrl+,' }
] as const satisfies readonly ShortcutItem[];

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
